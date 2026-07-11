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
})
