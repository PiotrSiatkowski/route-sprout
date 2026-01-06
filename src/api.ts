import {
	Keep,
	Path,
	PathDef,
	Pick,
	RoutesFromDefs,
	SParams,
	Segment,
	Slot,
	SlotDef,
	ToCamelCase,
	Wrap,
} from './dsl'

// ---------- Transform helpers ------------
const toCamelCase = <S extends string>(s: S) =>
	s
		.replace(/^-+/, '')
		.replace(/-+$/, '')
		.replace(/^_+/, '')
		.replace(/_+$/, '')
		.replace(/-([a-zA-Z0-9])/g, (_, c) => c.toUpperCase())
		.replace(/_([a-zA-Z0-9])/g, (_, c) => c.toUpperCase()) as ToCamelCase<S>

const IDENT = /^[A-Za-z_-][A-Za-z0-9_-]*$/

function assertValidName<const Name extends string>(
	kind: 'path' | 'slot' | 'wrap' | 'pick',
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

// ---------- DSL helpers (typed) ----------
export const keep = (): Keep => ({ kind: 'keep' })

export const path = <
	const Name extends string,
	const List extends readonly PathDef[] = readonly [],
>(
	name: Name,
	list?: List
): Path<Name, ToCamelCase<Name>, List> => ({
	kind: 'path',
	name: assertValidName('path', name),
	uuid: toCamelCase(name),
	list: (list ?? []) as List,
})

export const slot = <
	const Name extends string,
	const List extends readonly PathDef[] = readonly [],
>(
	name: Name,
	list?: List
): Slot<Name, `$${ToCamelCase<Name>}`, List> => ({
	kind: 'slot',
	name: assertValidName('slot', name),
	uuid: `$${toCamelCase(name)}`,
	list: (list ?? []) as List,
})

export const wrap = <
	const Name extends string,
	const List extends readonly PathDef[] = readonly [],
	Args = unknown,
>(
	name: Name,
	when: (args: Args) => boolean,
	list?: List
): Wrap<Name, `$${ToCamelCase<Name>}`, List, Args> => ({
	kind: 'wrap',
	name: assertValidName('wrap', name),
	uuid: `$${toCamelCase(name)}`,
	when,
	list: (list ?? []) as List,
})

export const pick = <
	const Name extends string,
	const Mode extends Record<string, readonly Segment[]>,
	const List extends readonly PathDef[] = readonly [],
>(
	name: Name,
	mode: Mode,
	list?: List
): Pick<Name, `$${ToCamelCase<Name>}`, Mode, List> => ({
	kind: 'pick',
	name: assertValidName('pick', name),
	uuid: `$${toCamelCase(name)}`,
	mode,
	list: (list ?? []) as List,
})

export const root = <const Defs extends readonly PathDef[]>(defs: Defs): RoutesFromDefs<Defs> =>
	buildNode([], path('', defs)) as unknown as RoutesFromDefs<Defs>

// ---------- Runtime implementation ----------
const url = (path: Segment[], search?: SParams) =>
	`/${path
		.filter(Boolean)
		.join('/')
		.replace(/\/{2,}/g, '/')}${search ? `?${search}` : ''}`

function buildNode(prefix: Segment[], parent: SlotDef) {
	const hasKeep = (pathDef: SlotDef) => pathDef.list.some((node: any) => node.kind === 'keep')
	const allPath = parent.kind === 'path' && parent.name ? [...prefix, parent.name] : prefix

	// If there is a keep(), the path itself is callable and acts as "keep"
	const target: any = makeTarget(hasKeep(parent), allPath)

	for (const child of parent.list) {
		if (child.kind !== 'keep') {
			if (child.uuid in target) {
				throw new Error(
					`Duplicate uuid "${String(child.uuid)}" under "${allPath.join('/') || '/'}"`
				)
			}
		}

		if (child.kind === 'slot') {
			target[child.uuid] = function bind(param: Segment) {
				const next = [...allPath, param]

				// leaf slot => callable endpoint directly
				if (child.list.length === 0) {
					return attachWhenAndJoin(makeTarget(true, next), next, [])
				}

				// non-leaf => subtree (optionally callable if keep())
				return Object.assign(makeTarget(hasKeep(child), next), buildNode(next, child))
			}
		} else if (child.kind === 'path') {
			if (child.list.length === 0) {
				const leafPath = [...allPath, child.name]
				target[child.uuid] = attachWhenAndJoin(makeTarget(true, leafPath), leafPath, [])
			} else {
				target[child.uuid] = buildNode(allPath, child)
			}
		} else if (child.kind === 'wrap') {
			target[child.uuid] = function wrap(arg: unknown) {
				const enabled = child.when(arg)
				const wrapped = enabled ? [...allPath, child.name] : allPath
				const subTree = buildNode(wrapped, child)

				return Object.assign(makeTarget(hasKeep(child), wrapped), subTree)
			}
		} else if (child.kind === 'pick') {
			target[child.uuid] = (value: keyof typeof child.mode) => {
				if (child.mode[value]) {
					return buildNode([...allPath, ...child.mode[value]], path('', child.list))
				} else {
					throw new Error(`pick("${child.name}") got unknown value: ${String(value)}`)
				}
			}
		}
	}

	return attachWhenAndJoin(target, allPath, parent.list)
}

function attachWhenAndJoin(target: any, basePath: Segment[], list: readonly PathDef[]) {
	const when = (cond: boolean, seg: Segment | readonly Segment[]) => {
		const nextPath = cond ? [...basePath, ...(Array.isArray(seg) ? seg : [seg])] : basePath

		// If this is a callable leaf (no children), preserve callability after .when().
		if (list.length === 0 && typeof target === 'function') {
			return attachWhenAndJoin(makeTarget(true, nextPath), nextPath, list)
		}

		// Rebuild "same subtree" at a new prefix:
		// Use a synthetic path '' so we don't append an extra segment name.
		return buildNode(nextPath, path('', list))
	}

	target.$when = when
	target.$join = function join(seg: Segment | readonly Segment[]) {
		return when(true, seg)
	}

	return target
}

const makeTarget = (callable: boolean, currentPath: Segment[]) => {
	return callable ? (search?: SParams) => url(currentPath, search) : Object.create(null)
}
