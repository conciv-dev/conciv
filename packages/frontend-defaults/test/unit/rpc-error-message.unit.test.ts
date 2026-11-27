import {describe, expect, test} from 'vitest'
import {ORPCError} from '@orpc/client'
import {engineUnreachable} from '@conciv/client'
import {classifyRpcError} from '../../src/shell/rpc-error-message.js'
import {widgetErrors} from '@conciv/errors'

describe('an error screen picks what to tell the user', () => {
  const unreachable = "conciv couldn't reach the engine. Check that the dev server is still running."
  const generic = 'Something went wrong. Try again.'
  test.each<[string, unknown, {message: string; fix?: string; transportFailure: boolean}]>([
    [
      'the engine cannot be reached',
      engineUnreachable('Cannot send message, WebSocket is not open.'),
      {message: unreachable, transportFailure: true},
    ],
    [
      'the pane throws while it renders',
      new Error('Text measurement requires OffscreenCanvas or a DOM canvas context.'),
      {message: 'Text measurement requires OffscreenCanvas or a DOM canvas context.', transportFailure: false},
    ],
    [
      'the engine answers with its own message',
      new ORPCError('NOT_FOUND', {message: 'Session ses_1 was not found'}),
      {message: 'Session ses_1 was not found', transportFailure: false},
    ],
    [
      'the engine refuses with a fix the user can follow',
      new ORPCError('CONFLICT', {message: 'the session is busy', data: {fix: 'Wait for the run to end.'}}),
      {message: 'the session is busy', fix: 'Wait for the run to end.', transportFailure: false},
    ],
    [
      'conciv refuses with a fix the user can follow',
      widgetErrors.PREVIEW_READ_ONLY(),
      {message: 'the session preview is read-only', fix: 'Open the session to write in it.', transportFailure: false},
    ],
  ])('when %s', (_situation, error, shown) => {
    expect(classifyRpcError(error, unreachable, generic)).toEqual(shown)
  })
})
