import {describe, it, expect, beforeEach} from 'vitest'
import {z} from 'zod'
import {pageVerb} from '@conciv/extension'
import {registerExtensionPageVerbs, clearExtensionPageVerbs, dispatchExtVerb} from '../src/page-verb-registry.js'

describe('ext verb dispatch', () => {
  beforeEach(() => clearExtensionPageVerbs())
  it('runs a registered verb and returns its result', async () => {
    registerExtensionPageVerbs('demo', {ping: pageVerb(z.object({n: z.number()}), (a) => ({pong: a.n + 1}))})
    expect(await dispatchExtVerb('demo', 'ping', '{"n":41}')).toEqual({result: {pong: 42}})
  })
  it('reports unknown-verb and invalid-args as structured errors', async () => {
    registerExtensionPageVerbs('demo', {ping: pageVerb(z.object({n: z.number()}), () => ({}))})
    expect(await dispatchExtVerb('demo', 'nope', '{}')).toMatchObject({error: {code: 'unknown-verb'}})
    expect(await dispatchExtVerb('demo', 'ping', '{"n":"x"}')).toMatchObject({error: {code: 'invalid-args'}})
  })
  it('reports a throwing handler as handler-error', async () => {
    registerExtensionPageVerbs('demo', {
      boom: pageVerb(z.object({}), () => {
        throw new Error('kaboom')
      }),
    })
    expect(await dispatchExtVerb('demo', 'boom', '{}')).toMatchObject({
      error: {code: 'handler-error', message: 'kaboom'},
    })
  })
  it('falls back to empty args when argsJson is malformed and the schema allows it', async () => {
    registerExtensionPageVerbs('demo', {ping: pageVerb(z.object({}).partial(), () => ({ok: true}))})
    expect(await dispatchExtVerb('demo', 'ping', 'not json')).toEqual({result: {ok: true}})
  })
  it('reports a non-JSON-serializable handler result as handler-error', async () => {
    registerExtensionPageVerbs('demo', {
      circular: pageVerb(z.object({}), () => {
        const node: Record<string, unknown> = {}
        node.self = node
        return node
      }),
    })
    expect(await dispatchExtVerb('demo', 'circular', '{}')).toMatchObject({error: {code: 'handler-error'}})
  })

  it('rejects results that JSON silently drops or converts', async () => {
    const cases: Record<string, unknown> = {
      nestedUndefined: {a: undefined},
      nestedFunction: {fn: () => 1},
      nestedSymbol: {sym: Symbol('x')},
      nestedBigint: {big: 1n},
      nestedNaN: {n: Number.NaN},
      nestedInfinity: {n: Number.POSITIVE_INFINITY},
      undefinedInArray: [1, undefined, 2],
    }
    for (const [name, result] of Object.entries(cases)) {
      registerExtensionPageVerbs('demo', {[name]: pageVerb(z.object({}), () => result)})
      expect(await dispatchExtVerb('demo', name, '{}')).toMatchObject({error: {code: 'handler-error'}})
    }
  })

  it('accepts a nested object of serializable primitives', async () => {
    registerExtensionPageVerbs('demo', {
      deep: pageVerb(z.object({}), () => ({a: {b: [1, 'x', true, null], c: 2.5}})),
    })
    expect(await dispatchExtVerb('demo', 'deep', '{}')).toEqual({result: {a: {b: [1, 'x', true, null], c: 2.5}}})
  })
})
