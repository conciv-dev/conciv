import {describe, expect, test} from 'vitest'
import {ORPCError} from '@orpc/client'
import {engineUnreachable} from '@conciv/contract'
import {classifyRpcError} from './rpc-error-message.js'

describe('an error screen picks what to tell the user', () => {
  const unreachable = "conciv couldn't reach the engine. Check that the dev server is still running."
  const generic = 'Something went wrong. Try again.'
  test.each<[string, unknown, {message: string}]>([
    [
      'the engine cannot be reached',
      engineUnreachable('Cannot send message, WebSocket is not open.'),
      {message: unreachable},
    ],
    [
      'the pane throws while it renders',
      new Error('Text measurement requires OffscreenCanvas or a DOM canvas context.'),
      {message: 'Text measurement requires OffscreenCanvas or a DOM canvas context.'},
    ],
    [
      'the engine answers with its own message',
      new ORPCError('NOT_FOUND', {message: 'Session ses_1 was not found'}),
      {message: 'Session ses_1 was not found'},
    ],
  ])('when %s', (_situation, error, shown) => {
    expect(classifyRpcError(error, unreachable, generic)).toEqual(shown)
  })
})
