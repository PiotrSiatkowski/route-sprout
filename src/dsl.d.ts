// ---------- Helpers ----------------------
export type Delimiter = '_' | '-'
export type ToCamelWhen<S extends string> = S extends `${infer A}${Delimiter}${infer B}`
	? A extends ''
		? // leading delimiter → skip without capitalizing
			ToCamelWhen<B>
		: // normal delimiter → capitalize next segment
			`${A}${Capitalize<ToCamelWhen<B>>}`
	: S

// ---------- Shared public types ----------
export type Segment = string | number
export type SParams = string | URLSearchParams

// "Absent" values mean: do not add a segment (passthrough)
export type Absent = null | undefined | false
export type SelectValue = Segment | Absent | true

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
	Rest extends readonly WrapChild[] = readonly WrapChild[],
	Args = unknown,
	Vals extends SelectValue = SelectValue,
> = { kind: 'wrap'; name: Name; uuid: Uuid; rest: Rest; when: (args: Args) => Vals }

export type When<
	Vals extends string | true,
	Rest extends readonly PathDef[] = readonly PathDef[],
> = { kind: 'when'; vals: Vals; rest: Rest }

export type WrapChild = SlotDef | When<any, readonly PathDef[]>

export type SlotDef =
	| Path<string, readonly PathDef[]>
	| Slot<string, readonly PathDef[]>
	| Wrap<string, readonly PathDef[], any>
export type PathDef = SlotDef | Keep

// ---------- Type-level route builder ----------
export type Whenable = {
	$when(cond: boolean, seg: Segment | readonly Segment[]): this
	$join(seg: Segment | readonly Segment[]): this
}

// detect "wide" primitives (string/number/boolean) inside a union
type IsDynamic<V> =
	string extends Extract<V, string>
		? true
		: number extends Extract<V, number>
			? true
			: boolean extends Extract<V, boolean>
				? true
				: false

// wrap children
type WrapDefaultChildren<Rest extends readonly WrapChild[]> = Exclude<Rest[number], Caze<any, any>> // Def union
type WrapWhens<Rest extends readonly WrapChild[]> = Extract<Rest[number], Caze<any, any>>

type WhenChildrenFor<Rest extends readonly WrapChild[], ArgsV> =
	Extract<WrapWhens<Rest>, { value: Args }> extends infer C
		? C extends Caze<any, infer R extends readonly Def[]>
			? R[number]
			: never
		: never

// ✅ what you asked for:
// - if V is dynamic (wide), only default routes
// - otherwise, default + matching when routes
type WrapChildrenFor<Rest extends readonly WrapChild[], V> =
	IsDynamic<V> extends true
		? WrapDefaultChildren<Rest>
		: WrapDefaultChildren<Rest> | WhenChildrenFor<Rest, V>

// props builder (from a union of defs)
type PropsFromUnion<U> = {
	[C in NonKeep<U> as C extends { name: infer N extends string }
		? ToCamelWhen<N>
		: never]: C extends Path<any, any>
		? RouteFromPath<C>
		: C extends Slot<any, any>
			? RouteFromSlot<C>
			: C extends Wrap<any, any, any, any>
				? RouteFromWrap<C>
				: never
}

type NonKeep<U> = Exclude<U, Keep>
type HasKeep<U> = Extract<U, Keep> extends never ? false : true

type WithWhen<T> = T & Whenable

// Example: apply it to the outputs
type RouteFromPath<P extends Path<any, any>> = WithWhen<
	P['rest'] extends readonly []
		? (search?: SParams) => string
		: HasKeep<P['rest'][number]> extends true
			? ((search?: SParams) => string) & PropsFromUnion<P['rest'][number]>
			: PropsFromUnion<P['rest'][number]>
>

type SlotResult<Rest extends readonly Def[]> = WithWhen<
	Rest extends readonly []
		? (search?: SParams) => string
		: HasKeep<Rest[number]> extends true
			? ((search?: SParams) => string) & PropsFromUnion<Rest[number]>
			: PropsFromUnion<Rest[number]>
>

type RouteFromSlot<S extends Slot<any, any>> = (param: Segment) => SlotResult<S['rest']>

// Wrap has TWO call modes:
// 1) direct override: Api.mode("admin")  -> typed with V = "admin"
// 2) computed:       Api.mode(ctxObj)    -> typed with V = ReturnType<select>
type WrapArgs<W extends Wrap<any, any, any, any>> = Parameters<W['select']>[0]
type WrapSel<W extends Wrap<any, any, any, any>> = ReturnType<W['select']>

type WrapResultFromUnion<U extends Def> = WithWhen<
	HasKeep<U> extends true ? ((search?: SParams) => string) & PropsFromUnion<U> : PropsFromUnion<U>
>

type RouteFromWrap<W extends Wrap<any, any, any, any>> =
	// direct selection value
	(<V extends SelectValue>(value: V) => WrapResultFromUnion<WrapChildrenFor<W['rest'], V>>) &
		// context selection via selector
		((args: WrapArgs<W>) => WrapResultFromUnion<WrapChildrenFor<W['rest'], WrapSel<W>>>)

export type RoutesFromDefs<Defs extends readonly Def[]> = WithWhen<
	HasKeep<Defs[number]> extends true
		? ((search?: SParams) => string) & PropsFromUnion<Defs[number]>
		: PropsFromUnion<Defs[number]>
>
