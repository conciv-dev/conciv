import {describe, it, expect} from 'vitest'
import {dehydrate, navigatePath} from '../src/dehydrate.js'

// Pure serializer logic (no DOM): the cases that broke the old JSON.stringify path. Real React
// elements / DOM are covered by the browser inspect IT; here we prove the hostile-value handling.

describe('dehydrate', () => {
  it('keeps functions as readable previews instead of dropping them', () => {
    const out = dehydrate({onClick: function handleClick() {}, label: 'Save'}) as Record<string, unknown>
    expect(out.onClick).toBe('ƒ handleClick()')
    expect(out.label).toBe('Save')
  })

  it('survives circular references (the old [object Object] cause)', () => {
    const a: Record<string, unknown> = {name: 'a'}
    a.self = a
    const out = dehydrate(a) as Record<string, unknown>
    expect(out.name).toBe('a')
    expect(out.self).toBe('[Circular]')
  })

  it('renders a React-element-shaped value as <Name />', () => {
    const el = {$$typeof: Symbol.for('react.transitional.element'), type: function Button() {}, props: {}}
    expect(dehydrate({icon: el}) as Record<string, unknown>).toEqual({icon: '<Button />'})
  })

  it('serializes bigint/symbol/undefined/NaN/Infinity without throwing or losing them', () => {
    const out = dehydrate({big: 10n, sym: Symbol('s'), un: undefined, nan: NaN, inf: Infinity}) as Record<
      string,
      unknown
    >
    expect(out.big).toBe('10n')
    expect(out.sym).toBe('Symbol(s)')
    expect(out.un).toBe('undefined')
    expect(out.nan).toBe('NaN')
    expect(out.inf).toBe('Infinity')
    expect(() => JSON.stringify(out)).not.toThrow()
  })

  it('collapses past max depth into a drillable sentinel with size', () => {
    const deep = {a: {b: {c: {d: 1}}}}
    const out = dehydrate(deep, {maxDepth: 2}) as {a: {b: unknown}}
    expect(out.a.b).toEqual({__aidx: 'object', size: 1, preview: '{…}'})
  })

  it('caps wide arrays and reports how many were omitted', () => {
    const out = dehydrate(
      Array.from({length: 60}, (_, i) => i),
      {maxItems: 50},
    ) as unknown[]
    expect(out).toHaveLength(51)
    expect(out[50]).toBe('… +10 more')
  })

  it('redacts secret-shaped keys', () => {
    const out = dehydrate({apiKey: 'sk-123', authToken: 'x', name: 'ok'}) as Record<string, unknown>
    expect(out.apiKey).toBe('[redacted]')
    expect(out.authToken).toBe('[redacted]')
    expect(out.name).toBe('ok')
  })

  it('does not throw on a getter that throws', () => {
    const obj = {
      get boom() {
        throw new Error('nope')
      },
      ok: 1,
    }
    const out = dehydrate(obj) as Record<string, unknown>
    expect(out.boom).toBe('[getter threw]')
    expect(out.ok).toBe(1)
  })

  it('collapses Map/Set and class instances to named previews', () => {
    class Store {
      x = 1
    }
    const out = dehydrate({m: new Map([['a', 1]]), s: new Set([1, 2]), store: new Store()}) as {
      m: unknown
      s: unknown
      store: unknown
    }
    expect(out.m).toMatchObject({__aidx: 'Map', size: 1})
    expect(out.s).toMatchObject({__aidx: 'Set', size: 2})
    expect(out.store).toMatchObject({__aidx: 'class', name: 'Store'})
  })
})

describe('navigatePath (drill-down)', () => {
  const root = {props: {user: {address: {city: 'NYC'}}, items: [{name: 'a'}, {name: 'b'}]}, state: null}

  it('walks object keys', () => {
    expect(navigatePath(root, 'props.user.address')).toEqual({found: true, value: {city: 'NYC'}})
  })

  it('indexes arrays with numeric segments', () => {
    expect(navigatePath(root, 'props.items.1.name')).toEqual({found: true, value: 'b'})
  })

  it('reports a missing segment instead of returning undefined silently', () => {
    expect(navigatePath(root, 'props.user.zip')).toEqual({found: false, value: undefined})
    expect(navigatePath(root, 'props.user.address.city.nope')).toEqual({found: false, value: undefined})
  })
})
