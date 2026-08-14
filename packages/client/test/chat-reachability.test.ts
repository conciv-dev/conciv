import {describe, expect, it} from 'vitest'
import {ORPCError} from '@orpc/client'
import {chatRetryDelayMs, isReachabilityError} from '../src/chat-connection.js'

describe('chatRetryDelayMs', () => {
  it('uses the normal retry delay when isOnline is not supplied', () => {
    expect(chatRetryDelayMs({retryDelayMs: 25})).toBe(25)
  })

  it('uses the normal retry delay while the engine reports online', () => {
    expect(chatRetryDelayMs({retryDelayMs: 25, isOnline: () => true})).toBe(25)
  })

  it('backs off to the offline retry delay while the engine reports offline', () => {
    expect(chatRetryDelayMs({retryDelayMs: 25, offlineRetryDelayMs: 400, isOnline: () => false})).toBe(400)
  })

  it('falls back to the default offline delay when none is configured', () => {
    expect(chatRetryDelayMs({isOnline: () => false})).toBe(2000)
  })
})

describe('isReachabilityError', () => {
  it('is false for an ORPCError: an expired-session retry is not a reachability signal, the server answered', () => {
    expect(isReachabilityError(new ORPCError('NOT_FOUND'))).toBe(false)
  })

  it('is true for a transport-level failure', () => {
    expect(isReachabilityError(new TypeError('fetch failed'))).toBe(true)
  })
})
