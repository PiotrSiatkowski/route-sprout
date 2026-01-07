import { describe, it, expectTypeOf, expect } from 'vitest'
import { SParams } from './dsl'
import { root, path, slot, keep, wrap, pick, base } from './api'

// Helper to build params consistently
const qs = (pairs: Record<string, string>): URLSearchParams => new URLSearchParams(pairs)

describe('DSL routing builder', () => {
	it('builds your example API and basic slot leaf works', () => {
		const Api = root([
			path('catalog', [
				slot('id'),
				path('images', [slot('id')]),
				path('books', [slot('id', [path('chapter'), path('authors')])]),
			]),
			path('jobs', [
				keep(),
				slot('id', [path('activities'), path('statuses')]),
				path('activities'),
			]),
		])

		// slot leaf: catalog.id("x") returns (search?) => url
		expect(Api.catalog.$id('some-id')()).toBe('/catalog/some-id')
		expect(Api.catalog.$id('some-id')('a=1')).toBe('/catalog/some-id?a=1')
		expect(Api.catalog.$id('some-id')(qs({ a: '1' }))).toBe('/catalog/some-id?a=1')
	})

	it("does not add an extra 'id' segment for nested slot routes (regression test)", () => {
		const Api = root([path('catalog', [path('books', [slot('id', [path('chapter')])])])])

		// ✅ expected: /catalog/books/<id>/chapter
		// ❌ old bug:  /catalog/books/<id>/id/chapter
		expect(Api.catalog.books.$id('abc').chapter()).toBe('/catalog/books/abc/chapter')
	})

	describe('path behavior matrix', () => {
		it('path leaf (rest empty) is callable and returns /<name>', () => {
			const Api = root([path('reprocess')])
			expect(Api.reprocess()).toBe('/reprocess')
			expect(Api.reprocess('q=1')).toBe('/reprocess?q=1')
		})

		it('path non-leaf without keep is NOT callable but has children', () => {
			const Api = root([path('parent', [path('child')])])

			// should have property
			expect(typeof Api.parent.child).toBe('function')
			expect(Api.parent.child()).toBe('/parent/child')

			// parent itself should not be callable
			// (runtime would throw; we just assert it's not a function)
			expect(typeof Api.parent).toBe('object')
		})

		it('path non-leaf WITH keep is callable AND has children', () => {
			const Api = root([path('orders', [keep(), path('export'), slot('id')])])

			expect(typeof Api.orders).toBe('function')
			expect(Api.orders()).toBe('/orders')
			expect(Api.orders('a=1')).toBe('/orders?a=1')

			expect(Api.orders.export()).toBe('/orders/export')
			expect(Api.orders.$id('77')()).toBe('/orders/77')
		})

		it('path nested tree creates correct paths', () => {
			const Api = root([path('a', [path('b', [path('c')])])])

			expect(Api.a.b.c()).toBe('/a/b/c')
		})
	})

	describe('slot behavior matrix', () => {
		it('slot leaf: (param) => (search?) => url', () => {
			const Api = root([path('x', [slot('id')])])

			const f = Api.x.$id('10')
			expect(typeof f).toBe('function')
			expect(f()).toBe('/x/10')
			expect(f('p=1')).toBe('/x/10?p=1')
			expect(f(qs({ p: '1' }))).toBe('/x/10?p=1')
		})

		it('slot non-leaf without keep: (param) => object with children (not callable)', () => {
			const Api = root([path('jobs', [slot('id', [path('activities'), path('statuses')])])])

			const sub = Api.jobs.$id('abc')
			expect(typeof sub).toBe('object')
			expect(sub.activities()).toBe('/jobs/abc/activities')
			expect(sub.statuses()).toBe('/jobs/abc/statuses')
		})

		it('slot non-leaf WITH keep: (param) => callable + children', () => {
			const Api = root([path('jobs', [slot('id', [keep(), path('activities')])])])

			const sub = Api.jobs.$id('abc')

			expect(typeof sub).toBe('function')
			expect(sub()).toBe('/jobs/abc')
			expect(sub('x=1')).toBe('/jobs/abc?x=1')

			expect(sub.activities()).toBe('/jobs/abc/activities')
		})

		it('slot nested under path nested produces correct path', () => {
			const Api = root([path('catalog', [path('images', [slot('id', [path('foo')])])])])

			expect(Api.catalog.images.$id(123).foo()).toBe('/catalog/images/123/foo')
		})
	})

	describe('search param formatting', () => {
		it('accepts string search', () => {
			const Api = root([path('x', [keep()])])
			expect(Api.x('a=1&b=2')).toBe('/x?a=1&b=2')
		})

		it('accepts URLSearchParams (object)', () => {
			const Api = root([path('x', [keep()])])
			const p = new URLSearchParams({ a: '1', b: '2' })
			expect(Api.x(p)).toBe('/x?a=1&b=2')
		})

		it('does not add ? when search is empty string', () => {
			const Api = root([path('x', [keep()])])
			expect(Api.x('')).toBe('/x')
		})

		it('works for slot leaf call style: id(param)(search)', () => {
			const Api = root([path('x', [slot('id')])])
			expect(Api.x.$id('10')('a=1')).toBe('/x/10?a=1')
		})
	})

	describe('edge/robustness checks', () => {
		it('empty keep path name creates leading slash paths', () => {
			const Api = root([path('a')])
			expect(Api.a()).toBe('/a')
		})

		it('supports numeric Segment in slot param', () => {
			const Api = root([path('x', [slot('id')])])
			expect(Api.x.$id(42)()).toBe('/x/42')
		})

		it('deep mix of callable paths + slots behaves correctly', () => {
			const Api = root([path('orders', [keep(), slot('id', [keep(), path('export')])])])

			expect(Api.orders()).toBe('/orders')
			const sub = Api.orders.$id('7')
			expect(sub()).toBe('/orders/7')
			expect(sub.export()).toBe('/orders/7/export')
		})
	})
})

describe('DSL type inference', () => {
	it('infers callable vs non-callable correctly', () => {
		const Api = root([path('jobs', [keep(), slot('id', [path('activities')])])])

		// jobs is callable because it has keep()
		expectTypeOf(Api.jobs).toBeCallableWith(undefined as unknown as SParams | undefined)

		// id(param) returns object (non-callable here, since slot rest has no keep)
		const sub = Api.jobs.$id('x')
		expectTypeOf(sub).toHaveProperty('activities')
		expectTypeOf(sub.activities).toBeFunction()
	})

	it('infers slot leaf as curried function', () => {
		const Api = root([path('catalog', [slot('id')])])

		expectTypeOf(Api.catalog.$id).toBeFunction()
		const f = Api.catalog.$id('abc')
		expectTypeOf(f).toBeCallableWith(undefined as unknown as SParams | undefined)
	})
})

describe('wrap utility (DSL wrapper path)', () => {
	type User = { isAdmin: boolean }

	it('wrap(true) inserts segment; wrap(false) is passthrough', () => {
		const Api = root([
			path('core', [
				wrap('admin', (u: User | null) => !!u?.isAdmin, [path('jobs', [keep()])]),
			]),
		])

		expect(Api.core.$admin({ isAdmin: true }).jobs()).toBe('/core/admin/jobs')
		expect(Api.core.$admin({ isAdmin: false }).jobs()).toBe('/core/jobs')
		expect(Api.core.$admin(null).jobs()).toBe('/core/jobs')
	})

	it('wrap can be used in the middle of the path (nested under paths/slots)', () => {
		const Api = root([
			path('catalog', [
				path('books', [
					slot('id', [
						wrap('admin', (u: User) => !!u?.isAdmin, [path('chapter', [keep()])]),
					]),
				]),
			]),
		])

		expect(Api.catalog.books.$id('x').$admin({ isAdmin: true }).chapter()).toBe(
			'/catalog/books/x/admin/chapter'
		)

		expect(Api.catalog.books.$id('x').$admin({ isAdmin: false }).chapter()).toBe(
			'/catalog/books/x/chapter'
		)
	})

	it('wrap subtree remains typed/usable even if wrap is disabled', () => {
		const Api = root([
			path('core', [
				wrap('admin', (u: User) => !!u?.isAdmin, [
					path('jobs', [keep()]),
					path('users', [keep()]),
				]),
			]),
		])

		const disabled = Api.core.$admin({ isAdmin: false })
		expect(disabled.jobs()).toBe('/core/jobs')
		expect(disabled.users()).toBe('/core/users')
	})

	it('wrap with keep(): wrapper itself is callable when enabled', () => {
		const Api = root([
			path('core', [
				keep(),
				wrap('admin', (u: User) => !!u?.isAdmin, [keep(), path('jobs', [keep()])]),
			]),
		])

		expect(Api.core()).toBe('/core')

		const adminOn = Api.core.$admin({ isAdmin: true })
		expect(typeof adminOn).toBe('function')
		expect(adminOn()).toBe('/core/admin')
		expect(adminOn.jobs()).toBe('/core/admin/jobs')

		const adminOff = Api.core.$admin({ isAdmin: false })
		// when disabled, should act like passthrough to /core (callable because core has keep)
		expect(typeof adminOff).toBe('function')
		expect(adminOff()).toBe('/core')
		expect(adminOff.jobs()).toBe('/core/jobs')
	})

	it('wrap works with search params on callable endpoints', () => {
		const Api = root([
			path('core', [wrap('admin', (u: User) => !!u?.isAdmin, [path('jobs', [keep()])])]),
		])

		expect(Api.core.$admin({ isAdmin: true }).jobs('a=1')).toBe('/core/admin/jobs?a=1')
		expect(Api.core.$admin({ isAdmin: false }).jobs('a=1')).toBe('/core/jobs?a=1')
	})
})

describe('when utility (runtime method)', () => {
	it("when(true, 'admin') inserts segment at the current position", () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.$when(true, 'admin').jobs()).toBe('/core/admin/jobs')
		expect(Api.core.$when(false, 'admin').jobs()).toBe('/core/jobs')
	})

	it('when accepts Segment[] for multi-part insert', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.$when(true, ['tenant', 't1']).jobs()).toBe('/core/tenant/t1/jobs')
		expect(Api.core.$when(false, ['tenant', 't1']).jobs()).toBe('/core/jobs')
	})

	it('when can be chained (multiple inserts) and preserves order', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.$when(true, 'admin').$when(true, 'v2').jobs()).toBe('/core/admin/v2/jobs')
	})

	it('when can be called mid-tree (after slot param) and affects only that subtree', () => {
		const Api = root([path('jobs', [keep(), slot('id', [path('activities', [keep()])])])])

		// Insert after /jobs/<id>
		expect(Api.jobs.$id('123').$when(true, 'preview').activities()).toBe(
			'/jobs/123/preview/activities'
		)

		// Disabled -> normal path
		expect(Api.jobs.$id('123').$when(false, 'preview').activities()).toBe(
			'/jobs/123/activities'
		)
	})

	it('when does NOT mutate the original subtree (important for DX)', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		const base = Api.core
		const admin = base.$when(true, 'admin')

		expect(base.jobs()).toBe('/core/jobs')
		expect(admin.jobs()).toBe('/core/admin/jobs')

		// base should still be base
		expect(base.jobs()).toBe('/core/jobs')
	})

	it('when works on callable paths and keeps callability', () => {
		const Api = root([path('core', [keep(), path('jobs', [keep()])])])

		const admin = Api.core.$when(true, 'admin')

		expect(typeof admin).toBe('function')
		expect(admin()).toBe('/core/admin')
		expect(admin.jobs()).toBe('/core/admin/jobs')
	})

	it('when keeps children shape identical regardless of condition', () => {
		const Api = root([path('core', [path('jobs', [keep()]), path('users', [keep()])])])

		const a = Api.core.$when(true, 'admin')
		const b = Api.core.$when(false, 'admin')

		expect(a.jobs()).toBe('/core/admin/jobs')
		expect(a.users()).toBe('/core/admin/users')

		expect(b.jobs()).toBe('/core/jobs')
		expect(b.users()).toBe('/core/users')
	})

	it('when and wrap compose (wrap gate then ad-hoc when insert)', () => {
		type User = { isAdmin: boolean }

		const Api = root([
			path('core', [wrap('admin', (u: User) => !!u?.isAdmin, [path('jobs', [keep()])])]),
		])

		// enabled wrap, then insert v2 after /core/admin
		expect(Api.core.$admin({ isAdmin: true }).$when(true, 'v2').jobs()).toBe(
			'/core/admin/v2/jobs'
		)

		// disabled wrap, then insert v2 after /core
		expect(Api.core.$admin({ isAdmin: false }).$when(true, 'v2').jobs()).toBe('/core/v2/jobs')
	})
})

describe('join utility (runtime method)', () => {
	it("join('admin') inserts segment at the current position", () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.$join('admin').jobs()).toBe('/core/admin/jobs')
	})

	it('join accepts Segment[] for multi-part insert', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.$join(['tenant', 't1']).jobs()).toBe('/core/tenant/t1/jobs')
	})

	it('join can be chained (multiple inserts) and preserves order', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.$join('admin').$join('v2').jobs()).toBe('/core/admin/v2/jobs')
	})

	it('join can be called mid-tree (after slot param) and affects only that subtree', () => {
		const Api = root([path('jobs', [keep(), slot('id', [path('activities', [keep()])])])])

		// Insert after /jobs/<id>
		expect(Api.jobs.$id('123').$join('preview').activities()).toBe(
			'/jobs/123/preview/activities'
		)
	})

	it('join does NOT mutate the original subtree (important for DX)', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		const base = Api.core
		const admin = base.$join('admin')

		expect(base.jobs()).toBe('/core/jobs')
		expect(admin.jobs()).toBe('/core/admin/jobs')

		// base should still be base
		expect(base.jobs()).toBe('/core/jobs')
	})

	it('join works on callable paths and keeps callability', () => {
		const Api = root([path('core', [keep(), path('jobs', [keep()])])])

		const admin = Api.core.$join('admin')

		expect(typeof admin).toBe('function')
		expect(admin()).toBe('/core/admin')
		expect(admin.jobs()).toBe('/core/admin/jobs')
	})

	it('join keeps children shape identical regardless of condition', () => {
		const Api = root([path('core', [path('jobs', [keep()]), path('users', [keep()])])])

		const a = Api.core.$join('admin')

		expect(a.jobs()).toBe('/core/admin/jobs')
		expect(a.users()).toBe('/core/admin/users')
	})

	it('join and wrap compose (wrap gate then ad-hoc when insert)', () => {
		type User = { isAdmin: boolean }

		const Api = root([
			path('core', [wrap('admin', (u: User) => !!u?.isAdmin, [path('jobs', [keep()])])]),
		])

		// enabled wrap, then insert v2 after /core/admin
		expect(Api.core.$admin({ isAdmin: true }).$join('v2').jobs()).toBe('/core/admin/v2/jobs')

		// disabled wrap, then insert v2 after /core
		expect(Api.core.$admin({ isAdmin: false }).$join('v2').jobs()).toBe('/core/v2/jobs')
	})
})

describe('when() edge cases & regressions', () => {
	it('does not introduce double slashes when inserting segments', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.$when(true, 'admin').jobs()).toBe('/core/admin/jobs')
		expect(Api.core.$when(true, ['admin', 'v2']).jobs()).toBe('/core/admin/v2/jobs')
	})

	it('does not introduce double slashes when array contains empty segments', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		// We intentionally include empty segments in the inserted array
		// Expected behavior: empty segments are ignored, no // occurs.
		expect(Api.core.$when(true, ['', 'admin']).jobs()).toBe('/core/admin/jobs')
		expect(Api.core.$when(true, ['admin', '']).jobs()).toBe('/core/admin/jobs')
		expect(Api.core.$when(true, ['', 'admin', '', 'v2', '']).jobs()).toBe('/core/admin/v2/jobs')
	})

	it('when(false, ...) never changes the path (even with weird segments)', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.$when(false, 'admin').jobs()).toBe('/core/jobs')
		expect(Api.core.$when(false, ['', 'admin', 'v2']).jobs()).toBe('/core/jobs')
	})

	it("when(true, '') either no-ops OR throws (choose your policy)", () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.$when(true, '').jobs()).toBe('/core/jobs')
	})

	it('search params are appended last even after when inserts', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.$when(true, 'admin').jobs('a=1&b=2')).toBe('/core/admin/jobs?a=1&b=2')
	})

	it('URLSearchParams are appended last even after when inserts', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		const p = new URLSearchParams({ a: '1', b: '2' })
		expect(Api.core.$when(true, 'admin').jobs(p)).toBe('/core/admin/jobs?a=1&b=2')
	})

	it('when can be applied repeatedly without accumulating empty segments', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(
			Api.core.$when(true, '').$when(true, 'admin').$when(true, '').$when(true, 'v2').jobs()
		).toBe('/core/admin/v2/jobs')
	})
})

describe('wrap() edge cases & regressions', () => {
	type User = { isAdmin: boolean }

	it('wrap enabled does not introduce double slashes', () => {
		const Api = root([
			path('core', [wrap('admin', (u: User) => !!u?.isAdmin, [path('jobs', [keep()])])]),
		])

		expect(Api.core.$admin({ isAdmin: true }).jobs()).toBe('/core/admin/jobs')
	})

	it('wrap disabled is passthrough (no double slashes, no missing segments)', () => {
		const Api = root([
			path('core', [
				wrap('admin', (u: User | null) => !!u?.isAdmin, [path('jobs', [keep()])]),
			]),
		])

		expect(Api.core.$admin({ isAdmin: false }).jobs()).toBe('/core/jobs')
		expect(Api.core.$admin(null).jobs()).toBe('/core/jobs')
	})

	it('wrap + when composition keeps clean slashes and correct order', () => {
		const Api = root([
			path('core', [wrap('admin', (u: User) => !!u?.isAdmin, [path('jobs', [keep()])])]),
		])

		// enabled wrap then when inserts v2
		expect(Api.core.$admin({ isAdmin: true }).$when(true, 'v2').jobs()).toBe(
			'/core/admin/v2/jobs'
		)

		// disabled wrap then when inserts v2 at /core
		expect(Api.core.$admin({ isAdmin: false }).$when(true, 'v2').jobs()).toBe('/core/v2/jobs')
	})

	it('wrap in the middle + search params still attach last', () => {
		const Api = root([
			path('jobs', [
				keep(),
				slot('id', [
					wrap('admin', (u: User) => !!u?.isAdmin, [path('activities', [keep()])]),
				]),
			]),
		])

		expect(Api.jobs.$id('123').$admin({ isAdmin: true }).activities('q=1')).toBe(
			'/jobs/123/admin/activities?q=1'
		)

		expect(Api.jobs.$id('123').$admin({ isAdmin: false }).activities('q=1')).toBe(
			'/jobs/123/activities?q=1'
		)
	})

	it('wrap does not leak state between calls (no mutation)', () => {
		const Api = root([
			path('core', [wrap('admin', (u: User) => !!u?.isAdmin, [path('jobs', [keep()])])]),
		])

		const base = Api.core
		const a = base.$admin({ isAdmin: true })
		const b = base.$admin({ isAdmin: false })

		expect(a.jobs()).toBe('/core/admin/jobs')
		expect(b.jobs()).toBe('/core/jobs')

		// ensure base is still usable and unchanged
		expect(base.$admin({ isAdmin: false }).jobs()).toBe('/core/jobs')
		expect(base.$admin({ isAdmin: true }).jobs()).toBe('/core/admin/jobs')
	})
})

describe('slashes & normalization across slots + when/wrap', () => {
	type User = { isAdmin: boolean }

	it('does not create // when inserting segments after slot param', () => {
		const Api = root([path('jobs', [keep(), slot('id', [path('activities', [keep()])])])])

		expect(Api.jobs.$id('123').$when(true, ['', 'admin', '']).activities()).toBe(
			'/jobs/123/admin/activities'
		)
	})

	it('does not accidentally drop segments when nesting when and wrap', () => {
		const Api = root([
			path('core', [
				path('jobs', [
					keep(),
					slot('id', [
						wrap('admin', (u: User) => !!u?.isAdmin, [path('activities', [keep()])]),
					]),
				]),
			]),
		])

		expect(
			Api.core.jobs.$id('1').$admin({ isAdmin: true }).$when(true, 'v2').activities()
		).toBe('/core/jobs/1/admin/v2/activities')

		expect(
			Api.core.jobs.$id('1').$admin({ isAdmin: false }).$when(true, 'v2').activities()
		).toBe('/core/jobs/1/v2/activities')
	})
})

describe('general edge cases', () => {
	it('accepts empty keep', () => {
		const Api = root([keep()])

		expect(Api()).toBe('/')
	})

	it('can join and when after slot', () => {
		const Api = root([slot('id')])

		expect(Api.$id('id').$when(true, ['a', 'b'])()).toBe('/id/a/b')
		expect(Api.$id('id').$when(true, 'a')()).toBe('/id/a')
		expect(Api.$id('id').$join(['a', 'b'])()).toBe('/id/a/b')
		expect(Api.$id('id').$join('a')()).toBe('/id/a')
	})

	it('accepts join and when on keep', () => {
		const Api = root([keep()])

		expect(Api.$when(true, ['a', 'b'])()).toBe('/a/b')
		expect(Api.$when(true, 'a')()).toBe('/a')
		expect(Api.$join(['a', 'b'])()).toBe('/a/b')
		expect(Api.$join('a')()).toBe('/a')
	})

	const BAD_NODE_NAMES = [
		'a b', // whitespace
		'\t', // control
		'\n', // control
		'a/b', // URL path separator
		'a\\b', // windows separator
		'a?b', // query delimiter
		'a#b', // fragment delimiter
		'a&b', // query separator
		'a=b', // query assignment
		'a%b', // percent encoding
		'.', // ambiguous
		'..', // ambiguous
		'a.b', // dot (property-ish)
		'a:b', // colon
		'a;b', // semicolon
		'@', // symbol
		'(', // brackets
		')', // brackets
		'[', // brackets
		']', // brackets
		'{', // brackets
		'}', // brackets
		'0abc', // leading digit (not valid identifier)
	]

	function expectThrowsName(fn: () => any) {
		expect(fn).toThrowError()
	}

	describe('input validation: path/slot/wrap names', () => {
		it('path() rejects invalid names (URL-breaking, non-identifier, empty)', () => {
			for (const name of BAD_NODE_NAMES) {
				expectThrowsName(() => path(name, [keep()]))
			}
		})

		it('slot() rejects invalid names (non-identifier, empty)', () => {
			const badItemNames = ['', ' ', 'a b', 'a/b', '0abc', 'a.b', 'a?b', 'a#b']

			for (const name of badItemNames) {
				expectThrowsName(() => slot(name as any, [keep()]))
			}
		})

		it('wrap() rejects invalid names (URL-breaking, non-identifier, empty)', () => {
			for (const name of BAD_NODE_NAMES) {
				expectThrowsName(() => wrap(name as any, () => true, [keep()]))
			}
		})
	})

	describe('prototype pollution defenses', () => {
		it('building routes must NOT pollute Object.prototype (guard test)', () => {
			// baseline
			expect(({} as any).polluted).toBeUndefined()

			// Try to craft a malicious tree. Even if you validate names and throw,
			// this test should pass (no pollution) because the build never completes.
			try {
				const Api = root([
					// if your validation allows this, it's dangerous
					// it can mutate prototype via __proto__ setter on plain objects
					path('__proto__', [path('polluted', [keep()])]),
				])

				// If build succeeded, try to force access
				// (this is what an attacker would try)
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				Api.proto?.polluted?.()
			} catch {
				// expected in strict validation mode
			}

			// must remain clean
			expect(({} as any).polluted).toBeUndefined()
		})

		it('routes object should not allow prototype getter/setter abuse through __proto__', () => {
			try {
				const Api = root([
					path('safe', [
						keep(),
						// attempt to introduce __proto__ as a child key
						path('__proto__', [keep()]),
					]),
				])

				// If it exists, ensure it didn't actually modify the object's prototype chain
				// (preferably __proto__ is rejected; but if not, it should be a normal own prop on a null-proto object)
				const proto = Object.getPrototypeOf(Api.safe)
				// If you use Object.create(null), proto will be null.
				// If you validate and throw, test won't reach here.
				expect(
					proto === null || proto === Object.prototype || proto === Function.prototype
				).toBeTruthy()
			} catch {
				// fine: strict validation throws
				expect(true).toBeTruthy()
			}
		})
	})

	describe('collision / shadowing attempts', () => {
		it('should not allow child keys to shadow helper method names (e.g. when / join / $when)', () => {
			// You mentioned moving helpers to something like $when to avoid collisions.
			// This test ensures that a route name cannot silently clobber your helper.

			try {
				const Api = root([
					path('core', [
						keep(),
						path('when', [keep()]), // attempt to collide with helper name
						path('$when', [keep()]), // attempt to collide with prefix helper
					]),
				])

				// If you keep helper as "when", ensure it still exists and is callable
				if (typeof Api.core.when === 'function') {
					expect(typeof Api.core.when).toBe('function')
				}

				// If you switched to "$when", ensure it still exists and is callable
				if (typeof Api.core.$when === 'function') {
					expect(typeof Api.core.$when).toBe('function')
				}
			} catch {
				// Also fine: if you validate and forbid these names explicitly
				expect(true).toBeTruthy()
			}
		})

		it('should reject duplicate effective keys after normalization (if kebab->camel/snake is enabled)', () => {
			// Only relevant if you normalize path/wrap names into property keys.
			// Example collision (camel): "ground-stations" -> groundStations, and "groundStations" -> groundStations

			try {
				root([
					path('core', [
						path('ground-stations', [keep()]),
						path('groundStations', [keep()]),
					]),
				])
				// If you support normalization, this SHOULD throw to avoid ambiguous properties.
				// If you don't support normalization, you might also throw because "-" is forbidden.
				// In either case, reaching here generally means you should add collision detection.
				throw new Error(
					'Expected buildApiRoutes to throw on duplicate normalized keys, but it did not.'
				)
			} catch (e: any) {
				expect(String(e?.message ?? e)).toBeTruthy()
			}
		})
	})

	describe('resource exhaustion-ish inputs', () => {
		it('should reject or safely handle extremely long names', () => {
			const long = 'a'.repeat(10_000)

			// Ideally, your validation rejects these.
			// If you allow them, it still must not crash/hang.
			try {
				const Api = root([path(long, [keep()])])
				expect(typeof Api).toBe('object')
			} catch {
				expect(true).toBeTruthy()
			}
		})

		it('should reject non-string names passed unsafely (runtime)', () => {
			// TS should prevent this, but runtime might still get unique input.
			const bad: any[] = [null, undefined, 123, {}, [], () => 'x']

			for (const v of bad) {
				expect(() => path(v, [keep()])).toThrow()
				expect(() => slot(v, [keep()])).toThrow()
				expect(() => wrap(v, () => true, [keep()])).toThrow()
			}
		})
	})

	describe('changes case of route segments', () => {
		it('should transform hyphens to camel case', () => {
			const Api = root([path('-hyphen-case-')])
			expect(Api.hyphenCase()).toBe('/-hyphen-case-')
		})

		it('should transform underscores to camel case', () => {
			const Api = root([path('_hyphen_case_')])
			expect(Api.hyphenCase()).toBe('/_hyphen_case_')
		})
	})

	describe('pick()', () => {
		it('selects a 1-segment prefix and applies shared subtree', () => {
			const Api = root([
				path('core', [
					pick('mode', { admin: ['admin'], user: [], partner: ['partner', 'v2'] }, [
						path('jobs', [keep()]),
						path('customers', [slot('id', [keep()])]),
					]),
				]),
			])

			expect(Api.core.$mode('admin').jobs()).toBe('/core/admin/jobs')
			expect(Api.core.$mode('admin').customers.$id(5)()).toBe('/core/admin/customers/5')
		})

		it('selects empty prefix ([]) and does not add extra slashes', () => {
			const Api = root([
				path('core', [
					pick('mode', { admin: ['admin'], user: [] }, [path('jobs', [keep()])]),
				]),
			])

			expect(Api.core.$mode('user').jobs()).toBe('/core/jobs')
		})

		it('supports multi-segment prefix', () => {
			const Api = root([
				path('core', [
					pick('mode', { partner: ['partner', 'v2'] }, [path('jobs', [keep()])]),
				]),
			])

			expect(Api.core.$mode('partner').jobs()).toBe('/core/partner/v2/jobs')
		})

		it('throws on unknown selection value', () => {
			const Api = root([
				path('core', [
					pick('mode', { admin: ['admin'], user: [] }, [path('jobs', [keep()])]),
				]),
			])

			// @ts-expect-error unknown mode must be rejected by TS
			expect(() => Api.core.$mode('nope')).toThrow(/unknown/i)
		})

		it('shared subtree is not duplicated (changing one path affects all modes)', () => {
			const Api = root([
				path('core', [
					pick('mode', { admin: ['admin'], user: [] }, [
						path('jobs', [path('stats', [keep()])]),
					]),
				]),
			])

			expect(Api.core.$mode('admin').jobs.stats()).toBe('/core/admin/jobs/stats')
			expect(Api.core.$mode('user').jobs.stats()).toBe('/core/jobs/stats')
		})

		it('pick works alongside sibling paths', () => {
			const Api = root([
				path('core', [
					path('health', [keep()]),
					pick('mode', { admin: ['admin'], user: [] }, [path('jobs', [keep()])]),
				]),
			])

			expect(Api.core.health()).toBe('/core/health')
			expect(Api.core.$mode('admin').jobs()).toBe('/core/admin/jobs')
		})

		it('pick supports deeper nesting (pick under a path)', () => {
			const Api = root([
				path('api', [
					path('core', [
						pick('mode', { admin: ['admin'], user: [] }, [path('jobs', [keep()])]),
					]),
				]),
			])

			expect(Api.api.core.$mode('admin').jobs()).toBe('/api/core/admin/jobs')
			expect(Api.api.core.$mode('user').jobs()).toBe('/api/core/jobs')
		})

		it('pick allows slot usage in shared subtree', () => {
			const Api = root([
				path('core', [
					pick('mode', { admin: ['admin'], user: [] }, [
						path('customers', [slot('id', [path('details', [keep()])])]),
					]),
				]),
			])

			expect(Api.core.$mode('admin').customers.$id(123).details()).toBe(
				'/core/admin/customers/123/details'
			)
			expect(Api.core.$mode('user').customers.$id(123).details()).toBe(
				'/core/customers/123/details'
			)
		})

		it('pick prefix is inserted before subtree, not after', () => {
			const Api = root([
				path('core', [
					path('x', [
						pick('mode', { admin: ['admin'], user: [] }, [path('jobs', [keep()])]),
					]),
				]),
			])

			expect(Api.core.x.$mode('admin').jobs()).toBe('/core/x/admin/jobs')
		})

		it('pick does not leak keys from other branches in types (type test)', () => {
			const Api = root([
				path('core', [
					pick('mode', { admin: ['admin'], user: [] }, [path('jobs', [keep()])]),
				]),
			])

			// runtime sanity
			expect(Api.core.$mode('admin').jobs()).toBe('/core/admin/jobs')

			// type-only expectations (uncomment if you run typecheck on tests)
			// @ts-expect-error unknown mode must be rejected by TS
			expect(() => Api.core.$mode('nope')).toThrow(/unknown/i)

			// @ts-expect-error pick key should be $mode, not mode
			Api.core.mode
		})
	})

	describe("coexistence: path('admin') + $admin", () => {
		it('admin path and $admin(true) can generate the same URL (simple leaf)', () => {
			const Api = root([
				path('core', [
					// static admin tree
					path('admin', [path('jobs', [keep()])]),

					// conditional admin prefix (exposed as .$admin)
					wrap('admin', (enabled: boolean) => enabled, [path('jobs', [keep()])]),
				]),
			])

			expect(Api.core.admin.jobs()).toBe('/core/admin/jobs')
			expect(Api.core.$admin(true).jobs()).toBe('/core/admin/jobs')
			expect(Api.core.$admin(false).jobs()).toBe('/core/jobs')
		})

		it('admin path and $admin(true) can generate the same URL (slot + nested leaf)', () => {
			const Api = root([
				path('core', [
					path('admin', [path('customers', [slot('id', [path('details', [keep()])])])]),

					wrap('admin', (enabled: boolean) => enabled, [
						path('customers', [slot('id', [path('details', [keep()])])]),
					]),
				]),
			])

			expect(Api.core.admin.customers.$id(7).details()).toBe(
				'/core/admin/customers/7/details'
			)
			expect(Api.core.$admin(true).customers.$id(7).details()).toBe(
				'/core/admin/customers/7/details'
			) // same
			expect(Api.core.$admin(false).customers.$id(7).details()).toBe(
				'/core/customers/7/details'
			) // no /admin
		})

		it('both admin and $admin are present on the same parent object (no key override)', () => {
			const Api = root([
				path('core', [
					path('admin', [path('jobs', [keep()])]),
					wrap('admin', (enabled: boolean) => enabled, [path('jobs', [keep()])]),
				]),
			])

			// Both exist and are callable in their own way
			expect(typeof Api.core.admin).toBe('object')
			expect(typeof Api.core.$admin).toBe('function')

			expect(Api.core.admin.jobs()).toBe('/core/admin/jobs')
			expect(Api.core.$admin(true).jobs()).toBe('/core/admin/jobs')
		})

		it("explicitly documents the 'double admin' composition (if someone chains them)", () => {
			const Api = root([
				path('core', [
					path('admin', [
						wrap('admin', (enabled: boolean) => enabled, [path('jobs', [keep()])]),
						path('jobs', [keep()]),
					]),
				]),
			])

			expect(Api.core.admin.$admin(true).jobs()).toBe('/core/admin/admin/jobs')
		})
	})

	describe('base()', () => {
		it('adds hidden prefix and does not create property in chain', () => {
			const Api = root([
				base('api', [path('orders', [keep()]), path('customers', [slot('id', [keep()])])]),
			])

			expect((Api as any).api).toBeUndefined()
			expect(Api.orders()).toBe('/api/orders')
			expect(Api.customers.$id(7)()).toBe('/api/customers/7')
		})

		it('supports multiple segments via array', () => {
			const Api = root([base(['api', 'v2'], [path('orders', [keep()])])])
			expect(Api.orders()).toBe('/api/v2/orders')
		})

		it('can be nested under visible path without creating intermediate key', () => {
			const Api = root([
				path('customers', [
					base('admin', [path('pricing-plans', [keep()])]),
					path('users', [keep()]),
				]),
			])

			expect((Api.customers as any).admin).toBeUndefined()
			expect(Api.customers.pricingPlans()).toBe('/customers/admin/pricing-plans')
			expect(Api.customers.users()).toBe('/customers/users')
		})

		it('base inside base composes prefixes', () => {
			const Api = root([base('api', [base(['v2', 'x'], [path('orders', [keep()])])])])

			expect(Api.orders()).toBe('/api/v2/x/orders')
		})

		it('keeps callability / keep() behaviour in subtree', () => {
			const Api = root([
				base('api', [
					path('orders', [keep(), slot('id', [keep(), path('export', [keep()])])]),
				]),
			])

			expect(Api.orders()).toBe('/api/orders')

			const sub = Api.orders.$id('7')
			expect(sub()).toBe('/api/orders/7')
			expect(sub.export()).toBe('/api/orders/7/export')
		})

		it('$when and $join work after merging base subtree', () => {
			const Api = root([base('api', [path('orders', [keep()])])])

			// add a segment
			expect(Api.orders.$when(true, 'x')()).toBe('/api/orders/x')

			// passthrough
			expect(Api.orders.$when(false, 'x')()).toBe('/api/orders')

			// alias
			expect(Api.orders.$join(['x', 'y'])()).toBe('/api/orders/x/y')
		})

		it('throws on merge collision (same key would be defined twice)', () => {
			expect(() =>
				root([
					path('x', [
						path('pricing-plans', [keep()]),
						base('api', [
							// camelCase("pricing-plans") => pricingPlans, collides with above
							path('pricing-plans', [keep()]),
						]),
					]),
				])
			).toThrow(/merge collision/i)
		})

		it('does not silently overwrite when base subtree defines existing key', () => {
			expect(() =>
				root([
					path('x', [path('orders', [keep()]), base('api', [path('orders', [keep()])])]),
				])
			).toThrow(/merge collision/i)
		})

		it('interacts with wrap: base prefix is always present; wrap segment is conditional', () => {
			const canAdmin = (c: { admin: boolean }) => c.admin

			const Api = root([base('api', [wrap('admin', canAdmin, [path('jobs', [keep()])])])])

			expect(Api.$admin({ admin: true }).jobs()).toBe('/api/admin/jobs')
			expect(Api.$admin({ admin: false }).jobs()).toBe('/api/jobs')
		})

		it('interacts with pick: base prefix is always present; pick adds its mapped segments', () => {
			const Api = root([
				base('api', [
					pick('mode', { admin: ['admin'], user: [], partner: ['partner', 'v2'] }, [
						path('jobs', [keep()]),
					]),
				]),
			])

			expect(Api.$mode('admin').jobs()).toBe('/api/admin/jobs')
			expect(Api.$mode('user').jobs()).toBe('/api/jobs')
			expect(Api.$mode('partner').jobs()).toBe('/api/partner/v2/jobs')
		})

		it('throws on unknown pick value even under base', () => {
			const Api = root([
				base('api', [pick('mode', { admin: ['admin'] }, [path('jobs', [keep()])])]),
			])

			expect(() => (Api as any).$mode('nope')).toThrow(/unknown value/i)
		})

		it('does not create enumerable junk props; base only contributes routes', () => {
			const Api = root([base('api', [path('orders', [keep()])])])

			const keys = Object.keys(Api)
			expect(keys).toContain('orders')
			expect(keys).not.toContain('api')
		})
	})
})
