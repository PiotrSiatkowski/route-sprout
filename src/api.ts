import {
	KebabToCamel,
	Keep,
	Path,
	PathDef,
	RoutesFromDefs,
	SParams,
	Segment,
	Slot,
	SlotDef,
	Wrap,
} from './dsl'

// ---------- Transform helpers ------------
const toCamel = (s: string) => s.replace(/-([a-zA-Z0-9])/g, (_, c) => c.toUpperCase())
type KeyFromSeg<S extends string> = KebabToCamel<S>

// ---------- DSL helpers (typed) ----------
export const keep = (): Keep => ({ kind: 'keep' })

export const path = <
	const Name extends string,
	const Rest extends readonly PathDef[] = readonly [],
>(
	name: Name,
	rest?: Rest
): Path<Name, KeyFromSeg<Name>, Rest> => ({
	kind: 'path',
	name: assertValidName('path', name),
	uuid: toCamel(name) as KeyFromSeg<Name>,
	rest: (rest ?? []) as Rest,
})

export const slot = <
	const Name extends string,
	const Rest extends readonly PathDef[] = readonly [],
>(
	name: Name,
	rest?: Rest
): Slot<Name, KeyFromSeg<Name>, Rest> => ({
	kind: 'slot',
	name: assertValidName('slot', name),
	uuid: toCamel(name) as KeyFromSeg<Name>,
	rest: (rest ?? []) as Rest,
})

export const wrap = <
	const Name extends string,
	const Rest extends readonly PathDef[] = readonly [],
	Args = unknown,
>(
	name: Name,
	when: (args: Args) => boolean,
	rest?: Rest
): Wrap<Name, KeyFromSeg<Name>, Rest, Args> => ({
	kind: 'wrap',
	name: assertValidName('wrap', name),
	uuid: toCamel(name) as KeyFromSeg<Name>,
	when,
	rest: (rest ?? []) as Rest,
})

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

function assertValidName<const Name extends string>(
	kind: 'path' | 'slot' | 'wrap',
	name: Name
): Name {
	// Allow your synthetic node("") only for nodes (internal)
	if (kind === 'path' && name === '') return name.trim() as Name

	if (!name) throw new Error(`${kind} name cannot be empty`)
	if (!IDENT.test(name)) {
		throw new Error(
			`${kind} name "${name}" must be a valid identifier (letters/digits/_/$, not starting with a digit).`
		)
	}

	return name.trim() as Name
}

// ---------- Runtime implementation ----------
const url = (path: Segment[], search?: SParams) =>
	`/${path.filter(Boolean).join('/').replace('/\/{2,}/g', '/')}${search ? `?${search}` : ''}`

// ---------- Typed root signature ----------
export function root<const Defs extends readonly PathDef[]>(defs: Defs): RoutesFromDefs<Defs> {
	return buildPath([], path('', defs)) as unknown as RoutesFromDefs<Defs>
}

function buildPath(prefix: Segment[], def: SlotDef) {
	const hasKeep = (pathDef: SlotDef) => pathDef.rest.some((c: any) => c.kind === 'keep')
	const allPath =
		def.kind === 'slot' || def.kind === 'wrap'
			? prefix
			: def.uuid
				? [...prefix, def.uuid]
				: prefix

	// If there is a keep(), the path itself is callable and acts as "keep"
	const target: any = hasKeep(def)
		? (search?: SParams) => url(allPath, search)
		: Object.create(null)

	for (const child of def.rest) {
		if (child.kind === 'slot') {
			if (child.rest.length === 0) {
				target[child.uuid] = (param: Segment) => {
					const leafPath = [...allPath, param]
					const fn: any = (search?: SParams) => url(leafPath, search)
					return attachWhenAndJoin(fn, leafPath, [])
				}
			} else {
				target[child.uuid] = (param: Segment) => {
					// Build subtree for nested parts under :id
					// Synthetic path with empty name so we don't add extra segment.
					const subTree = buildPath([...allPath, param], child)

					// Attach children (info, activities, etc.) to that function
					return Object.assign(
						hasKeep(child)
							? (search?: SParams) => url([...allPath, param], search)
							: Object.create(null),
						subTree
					)
				}
			}
		} else if (child.kind === 'path') {
			if (child.rest.length === 0) {
				const leafPath = [...allPath, child.uuid]
				const fn: any = (search?: SParams) => url(leafPath, search)
				target[child.uuid] = attachWhenAndJoin(fn, leafPath, [])
			} else {
				target[child.uuid] = buildPath(allPath, child)
			}
		} else if (child.kind === 'wrap') {
			target[child.uuid] = (arg: unknown) => {
				const enabled = child.when(arg)
				const wrapped = enabled ? [...allPath, child.uuid] : allPath
				const subTree = buildPath(wrapped, child as any)

				return Object.assign(
					// if wrap has keep(), it becomes callable at that point
					hasKeep(child as any)
						? (search?: SParams) => url(wrapped, search)
						: Object.create(null),
					subTree
				)
			}
		}
	}

	return attachWhenAndJoin(target, allPath, def.rest)
}

function attachWhenAndJoin(target: any, basePath: Segment[], rest: readonly PathDef[]) {
	const when = (cond: boolean, seg: Segment | readonly Segment[]) => {
		const nextPath = cond ? [...basePath, ...(Array.isArray(seg) ? seg : [seg])] : basePath

		// If this is a callable leaf (no children), preserve callability after .when().
		if (rest.length === 0 && typeof target === 'function') {
			const leaf: any = (search?: SParams) => url(nextPath, search)
			return attachWhenAndJoin(leaf, nextPath, rest)
		}

		// Rebuild "same subtree" at a new prefix:
		// Use a synthetic path '' so we don't append an extra segment name.
		return buildPath(nextPath, path('', rest))
	}

	target.$when = when
	target.$join = (seg: Segment | readonly Segment[]) => when(true, seg)

	return target
}
