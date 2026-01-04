# route-sprout 🌱 (typed API route builder DSL)

A tiny, cute DSL that grows **type-safe, composable URL builders** from a declarative route tree.

- ✅ Strong TypeScript inference from your route definition
- ✅ Nested resources with `item('id')` parameters
- ✅ Optional path gates with `wrap('admin', predicate, …)`
- ✅ Ad‑hoc conditional segments anywhere with `.when(cond, segment)`
- ✅ Search params supported (`string` or `URLSearchParams`)

> Think of it as a little route bonsai: you shape the tree once, then pluck URLs from any branch.

---

## Install

```bash
npm i route-sprout
# or
pnpm add route-sprout
# or
yarn add route-sprout
```

> If you publish under a different name, replace `route-sprout` accordingly.

---

## Quick start

```ts
import { buildApiRoutes, node, item, root } from "route-sprout";

const Api = buildApiRoutes([
  node("tasks", [
    root(),
    item("id", [node("activities"), node("derivatives")]),
    node("statistics"),
  ]),
] as const);

Api.tasks();                          // "/tasks"
Api.tasks("page=1");                  // "/tasks?page=1"
Api.tasks.id("abc")("a=1");           // "/tasks/abc?a=1"
Api.tasks.id("abc").activities();     // "/tasks/abc/activities"
```

---

## Why this exists

When you have lots of endpoints, you usually end up with:

- string concatenation sprinkled everywhere
- duplicated base paths
- typos that compile fine and fail at runtime
- route refactors that turn into treasure hunts

This DSL gives you:

- a single, declarative source of truth
- fluent, discoverable usage (`Api.tasks.id("x").activities()`)
- TypeScript autocomplete and type checking from **usage**, not comments

---

## Concepts

### `node(name, children?)`

A **static** path segment.

- `node("tasks")` → `/tasks`
- Nested nodes compose: `node("a", [node("b")])` → `/a/b`

Leaf nodes (no children) are callable and return a URL:

```ts
node("health"); // Api.health() -> "/health"
```

### `root()`

Marks a node (or item/wrap subtree) as **callable** at that position.

```ts
node("orders", [root(), node("export")]);
// Api.orders() -> "/orders"
// Api.orders.export() -> "/orders/export"
```

### `item(name, children?)`

A **parameterized** segment, typically used for IDs.

The `name` is only the **property key**. It is **not** inserted into the path.

```ts
node("tasks", [item("id")]);
// Api.tasks.id("abc")() -> "/tasks/abc"
```

With children:

```ts
node("tasks", [
  item("id", [node("activities"), node("derivatives")]),
]);

// Api.tasks.id("abc").activities() -> "/tasks/abc/activities"
```

### `wrap(name, predicate, children?)`

A conditional segment *defined in the tree*.

If `predicate(arg)` is `true`, `name` becomes a real path segment.
If `false`, it’s a pass-through (does not change the path).

```ts
type User = { isAdmin: boolean } | null;

node("core", [
  wrap("admin", (u: User) => !!u?.isAdmin, [
    node("tasks", [root()]),
  ]),
]);

Api.core.admin({ isAdmin: true }).tasks();  // "/core/admin/tasks"
Api.core.admin({ isAdmin: false }).tasks(); // "/core/tasks"
```

> `wrap` is ideal for *well-known*, reusable gates: `admin`, `v2`, `tenant`, etc.

### `.when(cond, segment | segment[])`

Ad‑hoc conditional segment insertion at **runtime**, anywhere in the chain.

```ts
Api.core.when(isAdmin, "admin").tasks();
Api.core.when(true, ["tenant", tenantId]).tasks();
Api.tasks.id("abc").when(flags.preview, "preview").activities();
```

- `cond = false` → no-op
- `segment` can be a single segment or an array of segments
- empty segments are ignored (your `url()` filters them out)

> `.when()` is ideal when you don’t want to bake a wrapper into the route tree.

---

## Search params

All callable endpoints accept an optional `search` parameter:

- `string` (already encoded)
- `URLSearchParams` (will be coerced to string via template interpolation)

```ts
Api.tasks("page=2&size=25");

const sp = new URLSearchParams({ page: "2", size: "25" });
Api.tasks(sp);
```

---

## Full example

```ts
import { buildApiRoutes, node, item, root, wrap } from "route-sprout";

type PortalUser = { isAdmin?: boolean } | null;

export const Api = buildApiRoutes([
  node("core", [
    wrap("admin", (u: PortalUser) => !!u?.isAdmin, [
      node("tasks", [root()]),
      node("customers", [item("id"), root()]),
    ]),
  ]),

  node("tasks", [
    root(),
    item("id", [node("activities"), node("derivatives")]),
    node("statistics"),
  ]),
] as const);

// usage
Api.tasks(); // "/tasks"
Api.tasks.id("123").activities(); // "/tasks/123/activities"

// runtime insert
Api.core.when(true, "v2").tasks(); // "/core/v2/tasks"
Api.core.admin({ isAdmin: true }).when(true, "v2").tasks(); // "/core/admin/v2/tasks"
```

---

## TypeScript tips

### Use `as const`
To get the best inference from your route definition, define the tree as a literal tuple:

```ts
const defs = [
  node("tasks", [root(), item("id")]),
] as const;

const Api = buildApiRoutes(defs);
```

### Autocomplete-friendly patterns
Because everything is computed from the definition tree, your editor can autocomplete:

- nodes (`Api.tasks`, `Api.orders.export`)
- items (`Api.tasks.id(…)`)
- nested children (`…id("x").activities()`)

---

## API reference

### Exports

- `buildApiRoutes(defs)`
- `node(name, rest?)`
- `item(name, rest?)`
- `wrap(name, when, rest?)`
- `root()`

### Types

- `Segment = string | number`
- `SParams = string | URLSearchParams`

---



## Gotchas & design notes

- `item("id")` uses `"id"` **only as a property name**, not a URL segment.
  - ✅ `/tasks/123`
  - ❌ `/tasks/id/123`
- `.when()` rebuilds a subtree and returns a new object/function.
  - It does **not** mutate the original branch.
- Empty segments are ignored in the final URL (because `url()` does `filter(Boolean)`).
  - If you want stricter behavior (throw on empty segment), enforce it in your own `.when` wrapper.

---

## Testing

This library is friendly to unit tests because the output is just strings.

Example (Vitest):

```ts
import { expect, test } from "vitest";
import { buildApiRoutes, node, item, root } from "route-sprout";

test("builds routes", () => {
  const Api = buildApiRoutes([node("tasks", [root(), item("id")])] as const);
  expect(Api.tasks()).toBe("/tasks");
  expect(Api.tasks.id("x")()).toBe("/tasks/x");
});
```

---

## License

MIT
