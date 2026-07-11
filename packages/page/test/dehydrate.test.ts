import {describe, expect, it} from 'vitest'
import {dehydrate, navigatePath} from '../src/dehydrate.js'

describe('navigatePath', () => {
  it('walks dotted paths into nested objects', () => {
    const root = {a: {b: {c: 7}}}
    expect(navigatePath(root, 'a.b.c')).toEqual({found: true, value: 7})
  })

  it('reports missing segments without throwing', () => {
    expect(navigatePath({a: 1}, 'a.b')).toEqual({found: false, value: undefined})
    expect(navigatePath(null, 'a')).toEqual({found: false, value: undefined})
  })
})

describe('dehydrate', () => {
  it('passes primitives through and caps long strings', () => {
    expect(dehydrate(42)).toBe(42)
    const long = 'x'.repeat(500)
    const out = dehydrate(long)
    expect(typeof out).toBe('string')
    expect(String(out).length).toBeLessThan(500)
  })

  it('redacts secret-looking keys', () => {
    const out = dehydrate({password: 'hunter2', plain: 'ok'})
    expect(JSON.stringify(out)).not.toContain('hunter2')
    expect(JSON.stringify(out)).toContain('ok')
  })

  it('collapses beyond max depth', () => {
    const deep = {a: {b: {c: {d: {e: 1}}}}}
    const out = JSON.stringify(dehydrate(deep, {maxDepth: 2}))
    expect(out).toContain('__conciv')
  })

  it('stringifies non-finite numbers, bigints, symbols, and undefined', () => {
    expect(dehydrate(Number.NaN)).toBe('NaN')
    expect(dehydrate(Number.POSITIVE_INFINITY)).toBe('Infinity')
    expect(dehydrate(Number.NEGATIVE_INFINITY)).toBe('-Infinity')
    expect(dehydrate(0)).toBe(0)
    expect(dehydrate(true)).toBe(true)
    expect(dehydrate(undefined)).toBe('undefined')
    expect(dehydrate(42n)).toBe('42n')
    expect(dehydrate(Symbol('tag'))).toBe('Symbol(tag)')
  })

  it('previews functions by name', () => {
    function namedFn(): void {}
    expect(dehydrate(namedFn)).toBe('ƒ namedFn()')
    expect(dehydrate(() => {})).toMatch(/^ƒ .*\(\)$/)
  })

  it('previews built-in objects', () => {
    expect(dehydrate(new Date('2026-01-02T03:04:05.000Z'))).toBe('2026-01-02T03:04:05.000Z')
    expect(dehydrate(/ab+c/gi)).toBe('/ab+c/gi')
    expect(dehydrate(new Error('boom'))).toBe('Error: boom')
    expect(dehydrate(Promise.resolve(1))).toBe('Promise {…}')
  })

  it('previews collections and binary buffers by size', () => {
    expect(dehydrate(new Map([['a', 1]]))).toEqual({__conciv: 'Map', size: 1, preview: 'Map(1)'})
    expect(dehydrate(new Set([1, 2]))).toEqual({__conciv: 'Set', size: 2, preview: 'Set(2)'})
    expect(dehydrate(new Uint8Array(4))).toEqual({__conciv: 'binary', size: 4, preview: 'Uint8Array(4)'})
    expect(dehydrate(new ArrayBuffer(8))).toEqual({__conciv: 'binary', size: 8, preview: 'ArrayBuffer(8)'})
  })

  it('previews class instances by constructor name and key count', () => {
    class Thing {
      x = 1
      y = 2
    }
    expect(dehydrate(new Thing())).toEqual({__conciv: 'class', name: 'Thing', preview: 'Thing', size: 2})
  })

  it('marks circular references', () => {
    const arr: unknown[] = []
    arr.push(arr)
    expect(dehydrate(arr, {maxDepth: 5})).toEqual(['[Circular]'])
    const obj: Record<string, unknown> = {}
    obj.self = obj
    expect(dehydrate(obj, {maxDepth: 5})).toEqual({self: '[Circular]'})
  })

  it('truncates long arrays with an overflow marker and honors the node budget', () => {
    const long = Array.from({length: 60}, (_, index) => index)
    const out = dehydrate(long, {maxItems: 50})
    expect(Array.isArray(out) ? out.at(-1) : null).toBe('… +10 more')
    const tight = dehydrate({a: {b: 1}, c: {d: 2}}, {maxDepth: 5, maxNodes: 2})
    expect(tight).toEqual({a: {}})
  })

  describe('react elements', () => {
    const el = (type: unknown): unknown => ({$$typeof: Symbol.for('react.transitional.element'), type})
    const legacy = (type: unknown): unknown => ({$$typeof: Symbol.for('react.element'), type})

    it('names host, function, and object-typed elements', () => {
      expect(dehydrate(el('div'))).toBe('<div />')
      function MyComponent(): null {
        return null
      }
      expect(dehydrate(el(MyComponent))).toBe('<MyComponent />')
      const withDisplayName = (): null => null
      withDisplayName.displayName = 'Fancy'
      expect(dehydrate(el(withDisplayName))).toBe('<Fancy />')
      expect(dehydrate(el({displayName: 'Memoed'}))).toBe('<Memoed />')
      expect(
        dehydrate(
          el({
            render: function Inner(): null {
              return null
            },
          }),
        ),
      ).toBe('<Inner />')
      expect(dehydrate(el({}))).toBe('<Component />')
      expect(dehydrate(el(undefined))).toBe('<Element />')
      expect(dehydrate(legacy('span'))).toBe('<span />')
    })

    it('names anonymous function components', () => {
      expect(dehydrate(el(() => null))).toMatch(/^<.+ \/>$/)
    })
  })
})
