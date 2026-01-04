import { describe, it, expectTypeOf, expect } from 'vitest'
import { SParams } from './dsl'
import { root, path, slot, keep, wrap } from './api'

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
		expect(Api.catalog.id('some-id')()).toBe('/catalog/some-id')
		expect(Api.catalog.id('some-id')('a=1')).toBe('/catalog/some-id?a=1')
		expect(Api.catalog.id('some-id')(qs({ a: '1' }))).toBe('/catalog/some-id?a=1')
	})

	it("does not add an extra 'id' segment for nested slot routes (regression test)", () => {
		const Api = root([path('catalog', [path('books', [slot('id', [path('chapter')])])])])

		// ✅ expected: /catalog/books/<id>/chapter
		// ❌ old bug:  /catalog/books/<id>/id/chapter
		expect(Api.catalog.books.id('abc').chapter()).toBe('/catalog/books/abc/chapter')
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
			expect(Api.orders.id('77')()).toBe('/orders/77')
		})

		it('path nested tree creates correct paths', () => {
			const Api = root([path('a', [path('b', [path('c')])])])

			expect(Api.a.b.c()).toBe('/a/b/c')
		})
	})

	describe('slot behavior matrix', () => {
		it('slot leaf: (param) => (search?) => url', () => {
			const Api = root([path('x', [slot('id')])])

			const f = Api.x.id('10')
			expect(typeof f).toBe('function')
			expect(f()).toBe('/x/10')
			expect(f('p=1')).toBe('/x/10?p=1')
			expect(f(qs({ p: '1' }))).toBe('/x/10?p=1')
		})

		it('slot non-leaf without keep: (param) => object with children (not callable)', () => {
			const Api = root([path('jobs', [slot('id', [path('activities'), path('statuses')])])])

			const sub = Api.jobs.id('abc')
			expect(typeof sub).toBe('object')
			expect(sub.activities()).toBe('/jobs/abc/activities')
			expect(sub.statuses()).toBe('/jobs/abc/statuses')
		})

		it('slot non-leaf WITH keep: (param) => callable + children', () => {
			const Api = root([path('jobs', [slot('id', [keep(), path('activities')])])])

			const sub = Api.jobs.id('abc')

			expect(typeof sub).toBe('function')
			expect(sub()).toBe('/jobs/abc')
			expect(sub('x=1')).toBe('/jobs/abc?x=1')

			expect(sub.activities()).toBe('/jobs/abc/activities')
		})

		it('slot nested under path nested produces correct path', () => {
			const Api = root([path('catalog', [path('images', [slot('id', [path('foo')])])])])

			expect(Api.catalog.images.id(123).foo()).toBe('/catalog/images/123/foo')
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
			expect(Api.x.id('10')('a=1')).toBe('/x/10?a=1')
		})
	})

	describe('edge/robustness checks', () => {
		it('empty keep path name creates leading slash paths', () => {
			const Api = root([path('a')])
			expect(Api.a()).toBe('/a')
		})

		it('supports numeric Segment in slot param', () => {
			const Api = root([path('x', [slot('id')])])
			expect(Api.x.id(42)()).toBe('/x/42')
		})

		it('deep mix of callable paths + slots behaves correctly', () => {
			const Api = root([path('orders', [keep(), slot('id', [keep(), path('export')])])])

			expect(Api.orders()).toBe('/orders')
			const sub = Api.orders.id('7')
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
		const sub = Api.jobs.id('x')
		expectTypeOf(sub).toHaveProperty('activities')
		expectTypeOf(sub.activities).toBeFunction()
	})

	it('infers slot leaf as curried function', () => {
		const Api = root([path('catalog', [slot('id')])])

		expectTypeOf(Api.catalog.id).toBeFunction()
		const f = Api.catalog.id('abc')
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

		expect(Api.core.admin({ isAdmin: true }).jobs()).toBe('/core/admin/jobs')
		expect(Api.core.admin({ isAdmin: false }).jobs()).toBe('/core/jobs')
		expect(Api.core.admin(null).jobs()).toBe('/core/jobs')
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

		expect(Api.catalog.books.id('x').admin({ isAdmin: true }).chapter()).toBe(
			'/catalog/books/x/admin/chapter'
		)

		expect(Api.catalog.books.id('x').admin({ isAdmin: false }).chapter()).toBe(
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

		const disabled = Api.core.admin({ isAdmin: false })
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

		const adminOn = Api.core.admin({ isAdmin: true })
		expect(typeof adminOn).toBe('function')
		expect(adminOn()).toBe('/core/admin')
		expect(adminOn.jobs()).toBe('/core/admin/jobs')

		const adminOff = Api.core.admin({ isAdmin: false })
		// when disabled, should act like passthrough to /core (callable because core has keep)
		expect(typeof adminOff).toBe('function')
		expect(adminOff()).toBe('/core')
		expect(adminOff.jobs()).toBe('/core/jobs')
	})

	it('wrap works with search params on callable endpoints', () => {
		const Api = root([
			path('core', [wrap('admin', (u: User) => !!u?.isAdmin, [path('jobs', [keep()])])]),
		])

		expect(Api.core.admin({ isAdmin: true }).jobs('a=1')).toBe('/core/admin/jobs?a=1')
		expect(Api.core.admin({ isAdmin: false }).jobs('a=1')).toBe('/core/jobs?a=1')
	})
})

describe('when utility (runtime method)', () => {
	it("when(true, 'admin') inserts segment at the current position", () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.when(true, 'admin').jobs()).toBe('/core/admin/jobs')
		expect(Api.core.when(false, 'admin').jobs()).toBe('/core/jobs')
	})

	it('when accepts Segment[] for multi-part insert', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.when(true, ['tenant', 't1']).jobs()).toBe('/core/tenant/t1/jobs')
		expect(Api.core.when(false, ['tenant', 't1']).jobs()).toBe('/core/jobs')
	})

	it('when can be chained (multiple inserts) and preserves order', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.when(true, 'admin').when(true, 'v2').jobs()).toBe('/core/admin/v2/jobs')
	})

	it('when can be called mid-tree (after slot param) and affects only that subtree', () => {
		const Api = root([path('jobs', [keep(), slot('id', [path('activities', [keep()])])])])

		// Insert after /jobs/<id>
		expect(Api.jobs.id('123').when(true, 'preview').activities()).toBe(
			'/jobs/123/preview/activities'
		)

		// Disabled -> normal path
		expect(Api.jobs.id('123').when(false, 'preview').activities()).toBe('/jobs/123/activities')
	})

	it('when does NOT mutate the original subtree (important for DX)', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		const base = Api.core
		const admin = base.when(true, 'admin')

		expect(base.jobs()).toBe('/core/jobs')
		expect(admin.jobs()).toBe('/core/admin/jobs')

		// base should still be base
		expect(base.jobs()).toBe('/core/jobs')
	})

	it('when works on callable paths and keeps callability', () => {
		const Api = root([path('core', [keep(), path('jobs', [keep()])])])

		const admin = Api.core.when(true, 'admin')

		expect(typeof admin).toBe('function')
		expect(admin()).toBe('/core/admin')
		expect(admin.jobs()).toBe('/core/admin/jobs')
	})

	it('when keeps children shape identical regardless of condition', () => {
		const Api = root([path('core', [path('jobs', [keep()]), path('users', [keep()])])])

		const a = Api.core.when(true, 'admin')
		const b = Api.core.when(false, 'admin')

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
		expect(Api.core.admin({ isAdmin: true }).when(true, 'v2').jobs()).toBe(
			'/core/admin/v2/jobs'
		)

		// disabled wrap, then insert v2 after /core
		expect(Api.core.admin({ isAdmin: false }).when(true, 'v2').jobs()).toBe('/core/v2/jobs')
	})
})

describe('join utility (runtime method)', () => {
	it("join('admin') inserts segment at the current position", () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.join('admin').jobs()).toBe('/core/admin/jobs')
	})

	it('join accepts Segment[] for multi-part insert', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.join(['tenant', 't1']).jobs()).toBe('/core/tenant/t1/jobs')
	})

	it('join can be chained (multiple inserts) and preserves order', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.join('admin').join('v2').jobs()).toBe('/core/admin/v2/jobs')
	})

	it('join can be called mid-tree (after slot param) and affects only that subtree', () => {
		const Api = root([path('jobs', [keep(), slot('id', [path('activities', [keep()])])])])

		// Insert after /jobs/<id>
		expect(Api.jobs.id('123').join('preview').activities()).toBe('/jobs/123/preview/activities')
	})

	it('join does NOT mutate the original subtree (important for DX)', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		const base = Api.core
		const admin = base.join('admin')

		expect(base.jobs()).toBe('/core/jobs')
		expect(admin.jobs()).toBe('/core/admin/jobs')

		// base should still be base
		expect(base.jobs()).toBe('/core/jobs')
	})

	it('join works on callable paths and keeps callability', () => {
		const Api = root([path('core', [keep(), path('jobs', [keep()])])])

		const admin = Api.core.join('admin')

		expect(typeof admin).toBe('function')
		expect(admin()).toBe('/core/admin')
		expect(admin.jobs()).toBe('/core/admin/jobs')
	})

	it('join keeps children shape identical regardless of condition', () => {
		const Api = root([path('core', [path('jobs', [keep()]), path('users', [keep()])])])

		const a = Api.core.join('admin')

		expect(a.jobs()).toBe('/core/admin/jobs')
		expect(a.users()).toBe('/core/admin/users')
	})

	it('join and wrap compose (wrap gate then ad-hoc when insert)', () => {
		type User = { isAdmin: boolean }

		const Api = root([
			path('core', [wrap('admin', (u: User) => !!u?.isAdmin, [path('jobs', [keep()])])]),
		])

		// enabled wrap, then insert v2 after /core/admin
		expect(Api.core.admin({ isAdmin: true }).join('v2').jobs()).toBe('/core/admin/v2/jobs')

		// disabled wrap, then insert v2 after /core
		expect(Api.core.admin({ isAdmin: false }).join('v2').jobs()).toBe('/core/v2/jobs')
	})
})

describe('when() edge cases & regressions', () => {
	it('does not introduce double slashes when inserting segments', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.when(true, 'admin').jobs()).toBe('/core/admin/jobs')
		expect(Api.core.when(true, ['admin', 'v2']).jobs()).toBe('/core/admin/v2/jobs')
	})

	it('does not introduce double slashes when array contains empty segments', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		// We intentionally include empty segments in the inserted array
		// Expected behavior: empty segments are ignored, no // occurs.
		expect(Api.core.when(true, ['', 'admin']).jobs()).toBe('/core/admin/jobs')
		expect(Api.core.when(true, ['admin', '']).jobs()).toBe('/core/admin/jobs')
		expect(Api.core.when(true, ['', 'admin', '', 'v2', '']).jobs()).toBe('/core/admin/v2/jobs')
	})

	it('when(false, ...) never changes the path (even with weird segments)', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.when(false, 'admin').jobs()).toBe('/core/jobs')
		expect(Api.core.when(false, ['', 'admin', 'v2']).jobs()).toBe('/core/jobs')
	})

	it("when(true, '') either no-ops OR throws (choose your policy)", () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.when(true, '').jobs()).toBe('/core/jobs')
	})

	it('search params are appended last even after when inserts', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(Api.core.when(true, 'admin').jobs('a=1&b=2')).toBe('/core/admin/jobs?a=1&b=2')
	})

	it('URLSearchParams are appended last even after when inserts', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		const p = new URLSearchParams({ a: '1', b: '2' })
		expect(Api.core.when(true, 'admin').jobs(p)).toBe('/core/admin/jobs?a=1&b=2')
	})

	it('when can be applied repeatedly without accumulating empty segments', () => {
		const Api = root([path('core', [path('jobs', [keep()])])])

		expect(
			Api.core.when(true, '').when(true, 'admin').when(true, '').when(true, 'v2').jobs()
		).toBe('/core/admin/v2/jobs')
	})
})

describe('wrap() edge cases & regressions', () => {
	type User = { isAdmin: boolean }

	it('wrap enabled does not introduce double slashes', () => {
		const Api = root([
			path('core', [wrap('admin', (u: User) => !!u?.isAdmin, [path('jobs', [keep()])])]),
		])

		expect(Api.core.admin({ isAdmin: true }).jobs()).toBe('/core/admin/jobs')
	})

	it('wrap disabled is passthrough (no double slashes, no missing segments)', () => {
		const Api = root([
			path('core', [
				wrap('admin', (u: User | null) => !!u?.isAdmin, [path('jobs', [keep()])]),
			]),
		])

		expect(Api.core.admin({ isAdmin: false }).jobs()).toBe('/core/jobs')
		expect(Api.core.admin(null).jobs()).toBe('/core/jobs')
	})

	it('wrap + when composition keeps clean slashes and correct order', () => {
		const Api = root([
			path('core', [wrap('admin', (u: User) => !!u?.isAdmin, [path('jobs', [keep()])])]),
		])

		// enabled wrap then when inserts v2
		expect(Api.core.admin({ isAdmin: true }).when(true, 'v2').jobs()).toBe(
			'/core/admin/v2/jobs'
		)

		// disabled wrap then when inserts v2 at /core
		expect(Api.core.admin({ isAdmin: false }).when(true, 'v2').jobs()).toBe('/core/v2/jobs')
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

		expect(Api.jobs.id('123').admin({ isAdmin: true }).activities('q=1')).toBe(
			'/jobs/123/admin/activities?q=1'
		)

		expect(Api.jobs.id('123').admin({ isAdmin: false }).activities('q=1')).toBe(
			'/jobs/123/activities?q=1'
		)
	})

	it('wrap does not leak state between calls (no mutation)', () => {
		const Api = root([
			path('core', [wrap('admin', (u: User) => !!u?.isAdmin, [path('jobs', [keep()])])]),
		])

		const base = Api.core
		const a = base.admin({ isAdmin: true })
		const b = base.admin({ isAdmin: false })

		expect(a.jobs()).toBe('/core/admin/jobs')
		expect(b.jobs()).toBe('/core/jobs')

		// ensure base is still usable and unchanged
		expect(base.admin({ isAdmin: false }).jobs()).toBe('/core/jobs')
		expect(base.admin({ isAdmin: true }).jobs()).toBe('/core/admin/jobs')
	})
})

describe('slashes & normalization across slots + when/wrap', () => {
	type User = { isAdmin: boolean }

	it('does not create // when inserting segments after slot param', () => {
		const Api = root([path('jobs', [keep(), slot('id', [path('activities', [keep()])])])])

		expect(Api.jobs.id('123').when(true, ['', 'admin', '']).activities()).toBe(
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

		expect(Api.core.jobs.id('1').admin({ isAdmin: true }).when(true, 'v2').activities()).toBe(
			'/core/jobs/1/admin/v2/activities'
		)

		expect(Api.core.jobs.id('1').admin({ isAdmin: false }).when(true, 'v2').activities()).toBe(
			'/core/jobs/1/v2/activities'
		)
	})
})
