import { Keep, Path, Wrap, Slot, PathDef, SlotDef, Segment, SParams, RoutesFromDefs } from './dsl'

// ---------- DSL helpers (typed) ----------
export const keep = (): Keep => ({ kind: 'keep' })

export const path = <
	const Name extends string,
	const Rest extends readonly PathDef[] = readonly [],
>(
	name: Name,
	rest?: Rest
): Path<Name, Rest> => ({ kind: 'path', name, rest: (rest ?? []) as Rest })

export const slot = <
	const Name extends string,
	const Rest extends readonly PathDef[] = readonly [],
>(
	name: Name,
	rest?: Rest
): Slot<Name, Rest> => ({ kind: 'slot', name, rest: (rest ?? []) as Rest })

export const wrap = <
	const Name extends string,
	const Rest extends readonly PathDef[] = readonly [],
	Args = unknown,
>(
	name: Name,
	when: (args: Args) => boolean,
	rest?: Rest
): Wrap<Name, Rest, Args> => ({ kind: 'wrap', name, when, rest: (rest ?? []) as Rest })

// ---------- Runtime implementation ----------
const url = (path: Segment[], search?: SParams) =>
	`${path.filter(Boolean).join('/')}${search ? `?${search}` : ''}`.replace('//', '/')

// ---------- Typed root signature ----------
export function root<const Defs extends readonly PathDef[]>(
	defs: Defs
): RoutesFromDefs<Defs> {
	return buildPath([], path('/', defs)) as unknown as RoutesFromDefs<Defs>
}

function buildPath(prefix: Segment[], def: SlotDef) {
	const hasKeep = (pathDef: SlotDef) => pathDef.rest.some((c) => c.kind === 'keep')
	const allPath =
		def.kind === 'slot' || def.kind === 'wrap'
			? prefix
			: def.name
				? [...prefix, def.name]
				: prefix

	// If there is a keep(), the path itself is callable and acts as "keep"
	const target: any = hasKeep(def) ? (search?: SParams) => url(allPath, search) : {}

	for (const child of def.rest) {
		if (child.kind === 'slot') {
			if (child.rest.length === 0) {
				target[child.name] = (param: Segment) => (search?: SParams) =>
					url([...allPath, param], search)
			} else {
				target[child.name] = (param: Segment) => {
					// Build subtree for nested parts under :id
					// Synthetic path with empty name so we don't add extra segment.
					const subTree = buildPath([...allPath, param], child)

					// Attach children (info, activities, etc.) to that function
					return Object.assign(
						hasKeep(child)
							? (search?: SParams) => url([...allPath, param], search)
							: {},
						subTree
					)
				}
			}
		} else if (child.kind === 'path') {
			if (child.rest.length === 0) {
				target[child.name] = (search?: SParams) => url([...allPath, child.name], search)
			} else {
				target[child.name] = buildPath(allPath, child)
			}
		} else if (child.kind === 'wrap') {
			target[child.name] = (arg: unknown) => {
				const enabled = child.when(arg)
				const wrapped = enabled ? [...allPath, child.name] : allPath
				const subTree = buildPath(wrapped, child as any)

				return Object.assign(
					// if wrap has keep(), it becomes callable at that point
					hasKeep(child as any) ? (search?: SParams) => url(wrapped, search) : {},
					subTree
				)
			}
		}
	}

	return attachWhenAndJoin(target, allPath, def.rest)
}

function attachWhenAndJoin(target: any, basePath: Segment[], rest: readonly PathDef[]) {
	target.when = (cond: boolean, seg: Segment | readonly Segment[]) => {
		// Rebuild "same subtree" at a new prefix:
		// Use a synthetic path '' so we don't append an extra segment name.
		return buildPath(
			cond ? [...basePath, ...(Array.isArray(seg) ? seg : [seg])] : basePath,
			path('', rest)
		)
	}
	target.join = (seg: Segment | readonly Segment[]) => {
		return buildPath([...basePath, ...(Array.isArray(seg) ? seg : [seg])], path('', rest))
	}

	return target
}
