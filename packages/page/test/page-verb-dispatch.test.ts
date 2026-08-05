import {describe, it, expect, beforeEach} from 'vitest'
import {z} from 'zod'
import {pageVerb, toolError} from '@conciv/extension'
import {isPageFailure, type PageRaisedError} from '@conciv/protocol/page-types'
import {registerExtensionPageVerbs, clearExtensionPageVerbs, dispatchExtVerb} from '../src/page-verb-registry.js'

function raisedOf(failure: unknown): PageRaisedError | undefined {
  if (!isPageFailure(failure)) throw new Error('expected a page failure')
  return failure.error.raised
}

describe('ext verb dispatch', () => {
  beforeEach(() => clearExtensionPageVerbs())
  it('runs a registered verb and returns its result', async () => {
    registerExtensionPageVerbs('demo', {ping: pageVerb(z.object({n: z.number()}), (a) => ({pong: a.n + 1}))})
    expect(await dispatchExtVerb('demo', 'ping', '{"n":41}')).toEqual({result: {pong: 42}})
  })
  it('rejects unknown-verb and invalid-args as coded failures', async () => {
    registerExtensionPageVerbs('demo', {ping: pageVerb(z.object({n: z.number()}), () => ({}))})
    await expect(dispatchExtVerb('demo', 'nope', '{}')).rejects.toMatchObject({error: {code: 'unknown-verb'}})
    await expect(dispatchExtVerb('demo', 'ping', '{"n":"x"}')).rejects.toMatchObject({
      error: {code: 'invalid-args'},
    })
  })
  it('rejects a throwing handler as handler-error', async () => {
    registerExtensionPageVerbs('demo', {
      boom: pageVerb(z.object({}), () => {
        throw new Error('kaboom')
      }),
    })
    await expect(dispatchExtVerb('demo', 'boom', '{}')).rejects.toMatchObject({
      error: {code: 'handler-error', message: 'kaboom'},
    })
  })
  it('carries the code and data a capability raises about its own work', async () => {
    registerExtensionPageVerbs('demo', {
      limited: pageVerb(z.object({}), () => {
        throw toolError('RATE_LIMITED', {message: 'slow down', data: {retryAfter: 30}})
      }),
    })
    await expect(dispatchExtVerb('demo', 'limited', '{}')).rejects.toMatchObject({
      error: {
        code: 'handler-error',
        message: 'slow down',
        raised: {code: 'RATE_LIMITED', message: 'slow down', data: {retryAfter: 30}},
      },
    })
  })
  it('drops raised data that cannot cross the wire, keeping the raised code', async () => {
    registerExtensionPageVerbs('demo', {
      cyclic: pageVerb(z.object({}), () => {
        const node: Record<string, unknown> = {}
        node.self = node
        throw toolError('BROKEN', {message: 'bad payload', data: node})
      }),
    })
    const failure = await dispatchExtVerb('demo', 'cyclic', '{}').then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).toMatchObject({error: {code: 'handler-error', raised: {code: 'BROKEN'}}})
    expect(JSON.stringify(failure)).not.toContain('self')
  })
  it('drops raised data whose keys ride on a prototype, since the wire would transmit them too', async () => {
    registerExtensionPageVerbs('demo', {
      inherited: pageVerb(z.object({}), () => {
        const data: Record<string, unknown> = Object.create({leaked: 'from the prototype'})
        data.own = 'kept'
        throw toolError('BROKEN', {message: 'bad payload', data})
      }),
    })
    const failure = await dispatchExtVerb('demo', 'inherited', '{}').then(
      () => null,
      (error: unknown) => error,
    )
    expect(raisedOf(failure)).toEqual({code: 'BROKEN', message: 'bad payload'})
  })

  it('keeps raised data on a null-prototype object, which the wire transmits key for key', async () => {
    registerExtensionPageVerbs('demo', {
      bare: pageVerb(z.object({}), () => {
        const data: Record<string, unknown> = Object.assign(Object.create(null), {retryAfter: 30})
        throw toolError('BROKEN', {message: 'bad payload', data})
      }),
    })
    const failure = await dispatchExtVerb('demo', 'bare', '{}').then(
      () => null,
      (error: unknown) => error,
    )
    expect(raisedOf(failure)).toEqual({code: 'BROKEN', message: 'bad payload', data: {retryAfter: 30}})
  })

  it('falls back to empty args when argsJson is malformed and the schema allows it', async () => {
    registerExtensionPageVerbs('demo', {ping: pageVerb(z.object({}).partial(), () => ({ok: true}))})
    expect(await dispatchExtVerb('demo', 'ping', 'not json')).toEqual({result: {ok: true}})
  })
  it('rejects a non-JSON-serializable handler result as handler-error', async () => {
    registerExtensionPageVerbs('demo', {
      circular: pageVerb(z.object({}), () => {
        const node: Record<string, unknown> = {}
        node.self = node
        return node
      }),
    })
    await expect(dispatchExtVerb('demo', 'circular', '{}')).rejects.toMatchObject({
      error: {code: 'handler-error'},
    })
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
      await expect(dispatchExtVerb('demo', name, '{}')).rejects.toMatchObject({
        error: {code: 'handler-error'},
      })
    }
  })

  it('accepts a nested object of serializable primitives', async () => {
    registerExtensionPageVerbs('demo', {
      deep: pageVerb(z.object({}), () => ({a: {b: [1, 'x', true, null], c: 2.5}})),
    })
    expect(await dispatchExtVerb('demo', 'deep', '{}')).toEqual({result: {a: {b: [1, 'x', true, null], c: 2.5}}})
  })
})
