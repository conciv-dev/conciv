import {describe, expect, it} from 'vitest'
import {ORPCError} from '@orpc/client'
import {transitionCall, type CallEvent, type CallState, type CallTransition} from './call.js'

describe('a hub call is sent to its engine', () => {
  it('drops the engine and sends once more when the engine refused the connection but never a third time, never sends again after any other transport error since the block may already have acted on a page, and answers an engine error, on a tab forgetting the engine only when the tab is no longer open there', () => {
    const refused = new TypeError('fetch failed', {
      cause: Object.assign(new Error('connect ECONNREFUSED'), {code: 'ECONNREFUSED'}),
    })
    const refusal = new ORPCError('APPROVAL_DENIED')
    const rows: [string, CallState, CallEvent, CallTransition][] = [
      [
        'resends once after a refused connection',
        {status: 'sent', path: 'runner', resent: false},
        {type: 'rejected', error: refused},
        {state: {status: 'sent', path: 'runner', resent: true}, effects: ['drop', 'resend']},
      ],
      [
        'never sends a third time',
        {status: 'sent', path: 'runner', resent: true},
        {type: 'rejected', error: refused},
        {state: {status: 'failed'}, effects: ['drop']},
      ],
      [
        'resends once after an unauthorized answer',
        {status: 'sent', path: 'tab', resent: false},
        {type: 'rejected', error: new ORPCError('UNAUTHORIZED')},
        {state: {status: 'sent', path: 'tab', resent: true}, effects: ['drop', 'resend']},
      ],
      [
        'never sends again after another transport error',
        {status: 'sent', path: 'tab', resent: false},
        {type: 'rejected', error: new TypeError('socket hang up')},
        {state: {status: 'failed'}, effects: ['drop']},
      ],
      [
        'answers an engine error on the runner',
        {status: 'sent', path: 'runner', resent: false},
        {type: 'rejected', error: refusal},
        {state: {status: 'answered'}, effects: []},
      ],
      [
        'checks the tab after an engine error on a tab',
        {status: 'sent', path: 'tab', resent: false},
        {type: 'rejected', error: refusal},
        {state: {status: 'checking'}, effects: ['check']},
      ],
      [
        'forgets the engine once the tab is no longer open there',
        {status: 'checking'},
        {type: 'checked', open: false},
        {state: {status: 'answered'}, effects: ['drop']},
      ],
      [
        'keeps the engine while the tab is still open there',
        {status: 'checking'},
        {type: 'checked', open: true},
        {state: {status: 'answered'}, effects: []},
      ],
    ]

    for (const [step, from, event, expected] of rows) expect(transitionCall(from, event), step).toEqual(expected)
  })
})
