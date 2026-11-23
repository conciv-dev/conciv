import {describe, expect, it} from 'vitest'
import {ORPCError} from '@orpc/client'
import {transitionCall, type CallState} from './call.js'

describe('a hub call is sent to its engine', () => {
  const refused = new TypeError('fetch failed', {
    cause: Object.assign(new Error('connect ECONNREFUSED'), {code: 'ECONNREFUSED'}),
  })

  it('drops the engine and sends once more when the engine refused the connection, never a third time', () => {
    const sent: CallState = {status: 'sent', path: 'runner', resent: false}
    const resent = transitionCall(sent, {type: 'rejected', error: refused})
    expect(resent).toEqual({state: {status: 'sent', path: 'runner', resent: true}, effects: ['drop', 'resend']})
    expect(transitionCall(resent.state, {type: 'rejected', error: refused})).toEqual({
      state: {status: 'failed'},
      effects: ['drop'],
    })
    expect(
      transitionCall(
        {status: 'sent', path: 'tab', resent: false},
        {type: 'rejected', error: new ORPCError('UNAUTHORIZED')},
      ),
    ).toEqual({state: {status: 'sent', path: 'tab', resent: true}, effects: ['drop', 'resend']})
  })

  it('never sends again after any other transport error, since the block may already have acted on a page', () => {
    expect(
      transitionCall(
        {status: 'sent', path: 'tab', resent: false},
        {type: 'rejected', error: new TypeError('socket hang up')},
      ),
    ).toEqual({state: {status: 'failed'}, effects: ['drop']})
  })

  it('answers an engine error, and on a tab forgets the engine only when the tab is no longer open there', () => {
    const refusal = new ORPCError('APPROVAL_DENIED')
    expect(transitionCall({status: 'sent', path: 'runner', resent: false}, {type: 'rejected', error: refusal})).toEqual(
      {
        state: {status: 'answered'},
        effects: [],
      },
    )
    const checking = transitionCall({status: 'sent', path: 'tab', resent: false}, {type: 'rejected', error: refusal})
    expect(checking).toEqual({state: {status: 'checking'}, effects: ['check']})
    expect(transitionCall(checking.state, {type: 'checked', open: false})).toEqual({
      state: {status: 'answered'},
      effects: ['drop'],
    })
    expect(transitionCall(checking.state, {type: 'checked', open: true})).toEqual({
      state: {status: 'answered'},
      effects: [],
    })
  })
})
