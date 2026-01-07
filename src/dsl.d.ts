// ---------- Helpers ----------------------
export type Delimiter = '_' | '-'
export type ToCamelCase<S extends string> = S extends `${infer A}${Delimiter}${infer B}`
	? A extends ''
		? ToCamelCase<B>
		: `${A}${Capitalize<ToCamelCase<B>>}`
	: S

// ---------- Shared public types ----------
export type Segment = string | number
export type SParams =
	| string
	| null
	| URLSearchParams
	| Record<string, string | number | boolean | null | undefined>

// ---------- DSL definition types ----------
export type Keep = { kind: 'keep' }

export type Path<
	Name extends string = string,
	Uuid extends string = string,
	List extends readonly PathDef[] = readonly PathDef[],
> = { kind: 'path'; name: Name; uuid: Uuid; list: List }

export type Slot<
	Name extends string = string,
	Uuid extends string = string,
	List extends readonly PathDef[] = readonly PathDef[],
> = { kind: 'slot'; name: Name; uuid: Uuid; list: List }

export type Wrap<
	Name extends string = string,
	Uuid extends string = string,
	List extends readonly PathDef[] = readonly PathDef[],
	Args = unknown,
> = { kind: 'wrap'; name: Name; uuid: Uuid; list: List; when: (args: Args) => boolean }

export type Pick<
	Name extends string = string,
	Uuid extends string = string,
	Mode extends Record<string, readonly Segment[]> = Record<string, readonly Segment[]>,
	List extends readonly PathDef[] = readonly PathDef[],
> = { kind: 'pick'; name: Name; uuid: Uuid; mode: Mode; list: List }

export type Base<
	Segs extends Segment | readonly Segment[] = Segment | readonly Segment[],
	List extends readonly PathDef[] = readonly PathDef[],
> = { kind: 'base'; segs: Segs; list: List }

export type SlotDef = Path | Slot | Wrap | Pick
export type PathDef = Path | Slot | Wrap | Pick | Keep | Base<any>

// ---------- Type-level route builder ----------
type PickKey<M> = Extract<keyof M, string>
type List<Defs extends readonly PathDef[]> = Defs[number]
type CallIfKeep<U, Props> =
	Extract<U, Keep> extends never ? Props : ((search?: SParams) => string) & Props
type WithWhen<T> = T & {
	$when(cond: boolean, seg: Segment | readonly Segment[]): this
	$join(seg: Segment | readonly Segment[]): this
	$tail(tail: string): string
}
type ExpandBase<U> =
	U extends Base<any, infer L extends readonly PathDef[]>
		? ExpandBase<Exclude<L[number], Keep>>
		: U

type VisibleChild<Defs extends readonly PathDef[]> = ExpandBase<Exclude<List<Defs>, Keep>>

type PropsFromChildren<Defs extends readonly PathDef[]> = {
	[C in VisibleChild<Defs> as C extends { uuid: infer N extends string }
		? ToCamelCase<N>
		: never]: C extends Path<any, any, any>
		? RouteFromPath<C>
		: C extends Slot<any, any, any>
			? RouteFromSlot<C>
			: C extends Wrap<any, any, any, any>
				? RouteFromWrap<C>
				: C extends Pick<any, any, any, any>
					? RouteFromPick<C>
					: never
}

type RouteFromPath<Node extends Path<any, any, any>> = WithWhen<
	Node['list'] extends readonly []
		? (search?: SParams) => string
		: CallIfKeep<List<Node['list']>, PropsFromChildren<Node['list']>>
>

type RouteFromSlot<Node extends Slot<any, any, any>> = (param: Segment) => SlotResult<Node['list']>
type SlotResult<Defs extends readonly PathDef[]> = WithWhen<
	Defs extends readonly []
		? (search?: SParams) => string
		: CallIfKeep<List<Defs>, PropsFromChildren<Defs>>
>

type RouteFromWrap<W extends Wrap<any, any, any, any>> = (
	arg: Parameters<W['when']>[0]
) => WithWhen<CallIfKeep<List<W['list']>, PropsFromChildren<W['list']>>>

type RouteFromPick<P extends Pick<any, any, any, any>> = (
	val: PickKey<P['mode']>
) => RoutesFromDefs<P['list']>

export type RoutesFromDefs<Defs extends readonly PathDef[]> = WithWhen<
	CallIfKeep<List<Defs>, PropsFromChildren<Defs>>
>
