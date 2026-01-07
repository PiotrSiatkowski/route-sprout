![Route Sprout Image](./image.png)

# route-sprout 🌱 (typed API route builder DSL)

[![npm version](https://img.shields.io/npm/v/route-sprout?color=blue)](https://www.npmjs.com/package/route-sprout)
[![bundle size](https://img.shields.io/bundlephobia/minzip/route-sprout)](https://bundlephobia.com/package/route-sprout)
[![license](https://img.shields.io/npm/l/route-sprout)](./LICENSE)
[![Types](https://img.shields.io/badge/TypeScript-ready-blue?logo=typescript)](https://www.typescriptlang.org/)
[![GitHub stars](https://img.shields.io/github/stars/PiotrSiatkowski/route-sprout?style=social)](https://github.com/PiotrSiatkowski/route-sprout)

A tiny, cute DSL that grows **type-safe, composable URL builders** from a declarative route tree.

---

## Install

```bash
npm i route-sprout
# or
pnpm add route-sprout
# or
yarn add route-sprout
```

## Quick start

```ts
import { root, path, slot, keep } from "route-sprout";

const Api = root([
  path("invoices", [
    keep(),
    slot("id", [
      keep(),
      path("price"), 
      path("customers")
    ]),
    path("statistics"),
  ]),
]);

Api.invoices();                           // "/invoices"
Api.invoices("page=1");                   // "/invoices?page=1"
Api.invoices.$id("abc")("a=1");           // "/invoices/abc?a=1"
Api.invoices.$id("abc").customers();      // "/invoices/abc/customers"
```

---

- ✅ Strong TypeScript inference from your route definition
- ✅ Nested resources with `slot('id')` parameters
- ✅ Optional path gates with `wrap('admin', predicate, …)`
- ✅ Ad‑hoc conditional segments anywhere with `.$when(cond, segments) and join(segments)`
- ✅ Search params supported (`string` or `URLSearchParams`)

> Think of it as a little route bonsai: you shape the tree once, then pluck URLs from any branch.

---

## Why this exists

When you have lots of endpoints, you usually end up with:

- string concatenation sprinkled everywhere
- duplicated base paths
- typos that compile fine and fail at runtime
- route refactors that turn into treasure hunts

This DSL gives you:

- a single, declarative source of truth
- fluent, discoverable usage (`Api.invoices.$id("x").customers()`)
- TypeScript autocomplete and type checking from **usage**, not comments

---

## Concepts

### `root(children)`

An entry point for your root tree that naturally denotes '/' path.

### `base(segs, list)` (hidden prefix)

`base()` adds one or more URL segments **without creating an object key in the chain**.

- Useful for global prefixes like `api`, `v2`, `internal`, etc.
- The prefix is **transparent** at the type level and runtime chain level.
- Supports a single segment or an array of segments: `Segment | Segment[]`.

```ts
import { base, keep, path, root, slot } from 'route-sprout'

export const Api = root([
  base('api', [
    path('orders', [keep()]),
    path('customers', [slot('id', [keep()])]),
  ]),
])

Api.orders()            // "/api/orders"
Api.customers.$id(7)()  // "/api/customers/7"

// There is no Api.api property:
(Api as any).api // undefined
```

### `path(name, children?)`

A **static** path segment.

- `path("invoices")` → `/invoices`
- Nested paths compose: `path("a", [path("b")])` → `/a/b`

Leaf paths (no children) are callable and return a URL:

```ts
path("health"); // Api.health() -> "/health"
```

### `keep()`

Marks a path (or slot/wrap subtree) as **callable** at that position.

```ts
path("orders", [keep(), path("export")]);
// Api.orders() -> "/orders"
// Api.orders.export() -> "/orders/export"
```

### `slot(name, children?)`

A **parameterized** segment, typically used for IDs.

The `name` is only the **property key**. It is **not** inserted into the path.

```ts
path("invoices", [slot("id")]);
// Api.invoices.$id("abc")() -> "/invoices/abc"
```

With children:

```ts
path("invoices", [
  slot("id", [
    path("price"), 
    path("customers")
  ]),
]);

// Api.invoices.$id("abc").customers() -> "/invoices/abc/customers"
```

### `wrap(name, predicate, children?)`

A conditional segment *defined in the tree*.

If `predicate(arg)` is `true`, `name` becomes a real path segment.
If `false`, it’s a pass-through (does not change the path).

```ts
type User = { isAdmin: boolean } | null;

path("core", [
  wrap("admin", (u: User) => !!u?.isAdmin, [
    path("invoices", [keep()]),
  ]),
]);

Api.core.$admin({ isAdmin: true }).invoices();  // "/core/admin/invoices"
Api.core.$admin({ isAdmin: false }).invoices(); // "/core/invoices"
```

> `wrap` is ideal for *well-known*, reusable gates: `admin`, `v2`, `tenant`, etc.

### `pick(name, segments, children?)`

An enumerated segment group *defined in the tree*.

```ts
type User = { isAdmin: boolean } | null;

path("core", [
  pick("role", { admin: "admin", user: ["user", "role"] }, [
    path("invoices", [keep()]),
  ]),
]);

Api.core.$role("admin").invoices();  // "/core/admin/invoices"
Api.core.$role("user").invoices();   // "/core/user/role/invoices"
```

> **Type inference tip:** to have TypeScript restrict `$mode(...)` to known keys,
> define the `mode` object with `as const`:
>
> ```ts
> pick('mode', {
>   admin: ['admin'],
>   user: [],
> }, [...])
> ```
>
> Then `$mode('nope')` is a type error.
```

### `.$when(cond, segment | segment[])`

Ad‑hoc conditional segment insertion at **runtime**, anywhere in the chain.

```ts
Api.core.$when(isAdmin, "admin").invoices();
Api.core.$when(true, ["tenant", tenantId]).invoices();
Api.invoices.$id("abc").$when(flags.preview, "preview").activities();
```

- `cond = false` → no-op
- `segment` can be a single segment or an array of segments
- empty segments are ignored (your `url()` filters them out)

> `.$when()` is ideal when you don’t want to bake a wrapper into the route tree.
> `.$join()` can be used in place of $when with condition being always true.

---

## Search params

All callable endpoints accept an optional `search` parameter:

- `string` (already encoded)
- `URLSearchParams` (will be coerced to string via template interpolation)
- `object` (will be coerced into URLSearchParams)

```ts
Api.invoices("page=2&size=25");

const sp = new URLSearchParams({ page: "2", size: "25" });
Api.invoices(sp);
```

---

## Full example

```ts
import { root, path, slot, keep, wrap } from "route-sprout";

type PortalUser = { isAdmin?: boolean } | null;

export const Api = root([
  path("core", [
    wrap("admin", (u: PortalUser) => !!u?.isAdmin, [
      path("invoices", [
        keep()
      ]),
      path("customers", [
        slot("id"), 
        keep()
      ]),
    ]),
  ]),
  path("invoices", [
    keep(),
    slot("id", [
      path("price"), 
      path("customers")
    ]),
    path("statistics"),
  ]),
]);

// usage
Api.invoices(); // "/invoices"
Api.invoices.$id("123").customers(); // "/invoices/123/customers"

// runtime insert
Api.core.$when(true, "v2").invoices(); // "/core/v2/invoices"
Api.core.$admin({ isAdmin: true }).$when(true, "v2").invoices(); // "/core/admin/v2/invoices"
```

### Autocomplete-friendly patterns
Because everything is computed from the definition tree, your editor can autocomplete:

- paths (`Api.invoices`, `Api.orders.export`)
- slots (`Api.invoices.$id(…)`)
- nested children (`…id("x").customers()`)

---

## API reference

### Exports

- `root(defs)`
- `base(segs, defs?)`
- `path(name, defs?)`
- `slot(name, defs?)`
- `wrap(name, when, defs?)`
- `pick(name, mode, defs?)`
- `keep()`

### Path level builders

- `$when(predicate, segments)`
- `$join(segments)`

---

## Dialects

If you like your DSLs with different “flavors”, route-sprout ships **dialects** as subpath exports.
Each dialect is the same engine, just different helper names.

Import a dialect like this:

```ts
import { grow, tree, seed, leaf, nest } from "route-sprout/dialect-tree";
```

### Available dialects

#### `route-sprout/dialect-path` (default)
- **root / path / slot / keep / wrap**

```ts
import { root, path, slot, keep, wrap } from "route-sprout/dialect-path";

const Api = root([
  path("invoices", [keep(), slot("id")]),
]);

Api.invoices.$id("123")(); // "/invoices/123"
```

#### `route-sprout/dialect-step`
- **make / step / item / self / gate**

```ts
import { make, step, item, self, gate } from "route-sprout/dialect-step";

const Api = make([
  step("orders", [self(), item("id"), step("export")]),
]);

Api.orders.export(); // "/orders/export"
```

#### `route-sprout/dialect-tree`
- **grow / tree / seed / twig / nest**

```ts
import { grow, tree, seed, twig, nest } from "route-sprout/dialect-tree";

const Api = grow([
  tree("core", [
    nest("admin", (u: { isAdmin?: boolean } | null) => !!u?.isAdmin, [
      tree("jobs", [twig()]),
    ]),
  ]),
]);

Api.core.$admin({ isAdmin: true }).jobs(); // "/core/admin/jobs"
```

#### `route-sprout/dialect-node`
- **link / node / bind / base / mask**

```ts
import { link, node, bind, base, mask } from "route-sprout/dialect-graph";

const Api = link([
  node("tasks", [base(), bind("id", [node("logs")])]),
]);

Api.tasks.$id("x").logs(); // "/tasks/x/logs"
```

### Mix-and-match?

Dialects are meant to be **all-in** per codebase/file. Technically you can mix imports, but future-you will sigh loudly.

## Gotchas & design notes

- `slot("id")` uses `"id"` **only as a property name**, not a URL segment.
  - ✅ `/invoices/123`
  - ❌ `/invoices/id/123`
- `.$when()` rebuilds a subtree and returns a new object/function.
  - It does **not** mutate the original branch.
- Empty segments are ignored in the final URL (because `url()` does `filter()`).
  - If you want stricter behavior (throw on empty segment), enforce it in your own `.$when` wrapper.

---

## Testing

This library is friendly to unit tests because the output is just strings.

Example (Vitest):

```ts
import { expect, test } from "vitest";
import { root, path, slot, keep } from "route-sprout";

test("builds routes", () => {
  const Api = root([path("invoices", [keep(), slot("id")])] as const);
  expect(Api.invoices()).toBe("/invoices");
  expect(Api.invoices.$id("x")()).toBe("/invoices/x");
});
```

---

## License

MIT
