import {describe, expect, it} from 'vitest'
import {ORPCError} from '@orpc/client'
import {isReachabilityError} from '../src/reachability.js'

describe('isReachabilityError', () => {
  it('is false for an ORPCError: an expired-session retry is not a reachability signal, the server answered', () => {
    expect(isReachabilityError(new ORPCError('NOT_FOUND'))).toBe(false)
  })

  it('is true for a transport-level failure', () => {
    expect(isReachabilityError(new TypeError('fetch failed'))).toBe(true)
  })
})
