// ---------- Helpers ----------------------
export type KebabToCamel<S extends string> = S extends `${infer A}-${infer B}`
	? `${A}${Capitalize<KebabToCamel<B>>}`
	: S

// ---------- Shared public types ----------
export type Segment = string | number
export type SParams = string | URLSearchParams

// ---------- DSL definition types ----------
export type Keep = { kind: 'keep' }

export type Path<
	Name extends string = string,
	Uuid extends string = string,
	Rest extends readonly PathDef[] = readonly PathDef[],
> = { kind: 'path'; name: Name; uuid: Uuid; rest: Rest }

export type Slot<
	Name extends string = string,
	Uuid extends string = string,
	Rest extends readonly PathDef[] = readonly PathDef[],
> = { kind: 'slot'; name: Name; uuid: Uuid; rest: Rest }

export type Wrap<
	Name extends string = string,
	Uuid extends string = string,
	Rest extends readonly PathDef[] = readonly PathDef[],
	Args = unknown,
> = { kind: 'wrap'; name: Name; uuid: Uuid; rest: Rest; when: (args: Args) => boolean }

export type SlotDef =
	| Path<string, readonly PathDef[]>
	| Slot<string, readonly PathDef[]>
	| Wrap<string, readonly PathDef[], any>
export type PathDef = SlotDef | Keep

// ---------- Type-level route builder ----------
export interface Whenable {
	$when(cond: boolean, seg: Segment | readonly Segment[]): this
	$join(seg: Segment | readonly Segment[]): this
}

type HasKeep<Rest extends readonly PathDef[]> =
	Extract<Rest[number], Keep> extends never ? false : true

type NonKeepChildren<Rest extends readonly PathDef[]> = Exclude<Rest[number], Keep>

type PropsFromChildren<Rest extends readonly PathDef[]> = {
	[C in NonKeepChildren<Rest> as C extends { name: infer N extends string }
		? N
		: never]: C extends Path<any, any, any>
		? RouteFromPath<C>
		: C extends Slot<any, any, any>
			? RouteFromSlot<C>
			: C extends Wrap<any, any, any, any>
				? RouteFromWrap<C>
				: never
}

type WithWhen<T> = T & Whenable

// Example: apply it to the outputs
type RouteFromPath<N extends Path<any, any, any>> = WithWhen<
	N['rest'] extends readonly []
		? (search?: SParams) => string
		: HasKeep<N['rest']> extends true
			? ((search?: SParams) => string) & PropsFromChildren<N['rest']>
			: PropsFromChildren<N['rest']>
>

type SlotResult<Rest extends readonly PathDef[]> = WithWhen<
	Rest extends readonly []
		? (search?: SParams) => string
		: HasKeep<Rest> extends true
			? ((search?: SParams) => string) & PropsFromChildren<Rest>
			: PropsFromChildren<Rest>
>

type RouteFromSlot<I extends Slot<any, any, any>> = (param: Segment) => SlotResult<I['rest']>

type WrapArg<W extends Wrap<any, any, any, any>> = Parameters<W['when']>[0]

type WrapResult<Rest extends readonly PathDef[]> = WithWhen<
	HasKeep<Rest> extends true
		? ((search?: SParams) => string) & PropsFromChildren<Rest>
		: PropsFromChildren<Rest>
>

type RouteFromWrap<W extends Wrap<any, any, any, any>> = (arg: WrapArg<W>) => WrapResult<W['rest']>

export type RoutesFromDefs<Defs extends readonly PathDef[]> = WithWhen<
	HasKeep<Defs> extends true
		? ((search?: SParams) => string) & PropsFromChildren<Defs>
		: PropsFromChildren<Defs>
>
