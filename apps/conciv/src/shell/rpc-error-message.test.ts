import {describe, expect, it} from 'vitest'
import {ORPCError} from '@orpc/client'
import {classifyRpcError} from './rpc-error-message.js'

const UNREACHABLE = "conciv couldn't reach the engine. Check that the dev server is still running."
const GENERIC = 'Something went wrong. Try again.'

describe('an error screen picks what to tell the user', () => {
  it.each<[string, unknown, {message: string; transportFailure: boolean}]>([
    ['the engine cannot be reached', new TypeError('Failed to fetch'), {message: UNREACHABLE, transportFailure: true}],
    ['the connection drops with no error at all', undefined, {message: UNREACHABLE, transportFailure: true}],
    [
      'the engine answers with its own message',
      new ORPCError('NOT_FOUND', {message: 'Session ses_1 was not found'}),
      {message: 'Session ses_1 was not found', transportFailure: false},
    ],
  ])('when %s', (_situation, error, shown) => {
    expect(classifyRpcError(error, UNREACHABLE, GENERIC)).toEqual(shown)
  })
})
