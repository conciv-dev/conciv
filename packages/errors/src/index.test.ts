import {describe, expect, it} from 'vitest'
import {clientPayload, decorateError, isConcivError, makeError, serialize} from './index.js'

describe('makeError', () => {
  it('builds a branded error with the full contract shape', () => {
    const error = makeError({
      message: 'session x not found',
      code: 'record-not-found',
      category: 'user',
      userCode: 'state.record-not-found',
      statusCode: 404,
      details: {sessionId: 'x'},
    })
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ConcivError')
    expect(error.code).toBe('record-not-found')
    expect(error.category).toBe('user')
    expect(error.userCode).toBe('state.record-not-found')
    expect(error.userMessage).toBe('session not found')
    expect(error.statusCode).toBe(404)
    expect(error.details).toEqual({sessionId: 'x'})
    expect(isConcivError(error)).toBe(true)
  })

  it('defaults category to internal and statusCode by category', () => {
    const internal = makeError({message: 'x', code: 'c', userCode: 'core.internal'})
    expect(internal.category).toBe('internal')
    expect(internal.statusCode).toBe(500)
    const user = makeError({message: 'x', code: 'c', category: 'user', userCode: 'core.internal'})
    expect(user.statusCode).toBe(400)
  })

  it('explicit userMessage overrides the user-codes map', () => {
    const error = makeError({message: 'x', code: 'c', userCode: 'core.internal', userMessage: 'custom copy'})
    expect(error.userMessage).toBe('custom copy')
  })

  it('resolves custom categories', () => {
    const error = makeError({
      message: 'x',
      code: 'c',
      userCode: 'core.internal',
      category: 'custom',
      customCategory: 'flaky',
    })
    expect(error.category).toBe('flaky')
  })

  it('carries causations', () => {
    const cause = makeError({message: 'root', code: 'root-code', userCode: 'core.internal'})
    const error = makeError({message: 'outer', code: 'outer-code', userCode: 'core.internal', causations: [cause]})
    expect(error.causations?.[0]?.code).toBe('root-code')
  })
})

describe('decorateError', () => {
  it('brands an existing error preserving message, name and stack', () => {
    const raw = new TypeError('fetch failed')
    const stack = raw.stack
    const decorated = decorateError({
      error: raw,
      code: 'records-request-failed',
      userCode: 'state.records-request-failed',
    })
    expect(decorated).toBe(raw)
    expect(decorated.name).toBe('TypeError')
    expect(decorated.message).toBe('fetch failed')
    expect(decorated.stack).toBe(stack)
    expect(isConcivError(decorated)).toBe(true)
  })
})

describe('isConcivError', () => {
  it('rejects bare errors and non-errors', () => {
    expect(isConcivError(new Error('bare'))).toBe(false)
    expect(isConcivError('nope')).toBe(false)
    expect(isConcivError(null)).toBe(false)
  })
})

describe('serialize', () => {
  it('flattens error, own props, nested errors and causations', () => {
    const cause = makeError({message: 'root', code: 'root-code', userCode: 'core.internal'})
    const error = makeError({
      message: 'outer',
      code: 'outer-code',
      userCode: 'core.internal',
      causations: [cause],
      details: {port: 1},
    })
    const out = serialize(error)
    expect(out).toMatchObject({
      name: 'ConcivError',
      message: 'outer',
      code: 'outer-code',
      details: {port: 1},
      conciv_error: true,
    })
    const flat = out !== null && typeof out === 'object' ? out : {}
    expect(flat).toHaveProperty('stack')
    const causations = Reflect.get(flat, 'causations')
    expect(Array.isArray(causations)).toBe(true)
  })

  it('survives circular causation chains', () => {
    const a = makeError({message: 'a', code: 'a', userCode: 'core.internal'})
    const b = makeError({message: 'b', code: 'b', userCode: 'core.internal', causations: [a]})
    a.causations = [b]
    expect(() => serialize(b)).not.toThrow()
  })

  it('passes non-errors through', () => {
    expect(serialize('plain')).toBe('plain')
  })
})

describe('clientPayload', () => {
  const error = makeError({
    message: 'session x not found',
    code: 'record-not-found',
    userCode: 'state.record-not-found',
    details: {sessionId: 'x'},
    userDetails: {retryable: false},
  })

  it('ships only user-safe fields outside dev', () => {
    expect(clientPayload(error, false)).toEqual({
      message: 'session not found',
      code: 'state.record-not-found',
      details: {retryable: false},
    })
  })

  it('adds the internal block in dev', () => {
    const payload = clientPayload(error, true)
    expect(payload.internal).toMatchObject({
      code: 'record-not-found',
      message: 'session x not found',
      details: {sessionId: 'x'},
    })
  })
})
