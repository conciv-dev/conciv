import {describe, expect, it} from 'vitest'
import {clientPayload, defineErrors, isConcivError} from './index.js'

const {error, is} = defineErrors<'download-failed' | 'record-not-found'>({
  scope: 'state',
  userMessages: {
    'download-failed': 'could not download the conciv state server',
    'record-not-found': 'session not found',
  },
  httpStatus: {'record-not-found': 404},
})

describe('defineErrors', () => {
  it('builds errors with the full contract shape', () => {
    const built = error('record-not-found', 'session x not found', {sessionId: 'x'})
    expect(built).toBeInstanceOf(Error)
    expect(built.name).toBe('ConcivError')
    expect(built.scope).toBe('state')
    expect(built.code).toBe('record-not-found')
    expect(built.userCode).toBe('state.record-not-found')
    expect(built.userMessage).toBe('session not found')
    expect(built.httpStatus).toBe(404)
    expect(built.details).toEqual({sessionId: 'x'})
  })

  it('defaults httpStatus to 500 and details to empty', () => {
    const built = error('download-failed', 'boom')
    expect(built.httpStatus).toBe(500)
    expect(built.details).toEqual({})
  })

  it('is accepts own scope and rejects others', () => {
    const other = defineErrors<'x'>({scope: 'core', userMessages: {x: 'x'}})
    expect(is(error('download-failed', 'boom'))).toBe(true)
    expect(is(other.error('x', 'boom'))).toBe(false)
    expect(is(new Error('bare'))).toBe(false)
    expect(is('not an error')).toBe(false)
  })

  it('isConcivError accepts any scope', () => {
    const other = defineErrors<'x'>({scope: 'core', userMessages: {x: 'x'}})
    expect(isConcivError(error('download-failed', 'boom'))).toBe(true)
    expect(isConcivError(other.error('x', 'boom'))).toBe(true)
    expect(isConcivError(new Error('bare'))).toBe(false)
  })
})

describe('clientPayload', () => {
  it('redacts internal when dev is false', () => {
    const payload = clientPayload(error('record-not-found', 'session x not found', {sessionId: 'x'}), false)
    expect(payload).toEqual({message: 'session not found', code: 'state.record-not-found'})
  })

  it('includes internal when dev is true', () => {
    const payload = clientPayload(error('record-not-found', 'session x not found', {sessionId: 'x'}), true)
    expect(payload.internal).toEqual({
      scope: 'state',
      code: 'record-not-found',
      message: 'session x not found',
      details: {sessionId: 'x'},
    })
  })
})
