import {describe, expect, test} from 'vitest'
import {conflictAfterTakeOver, conflictFor, NO_CONFLICT, TERMINAL_RECONNECTED} from '../src/chat/conflict.js'

const attached = {code: 'SESSION_ATTACHED', message: 'This session is driven from your terminal.'}
const blocked = {code: 'EXTERNAL_BLOCKED', message: 'Claude is working in your terminal right now.'}
const confirm = {code: 'EXTERNAL_CONFIRM', message: 'Claude is open in your terminal.'}

describe('a send the server turned down', () => {
  test('offers to take the session back when the terminal is driving it', () => {
    expect(conflictFor(attached)).toEqual({kind: 'attached', message: 'This session is driven from your terminal.'})
  })

  test('says the terminal is busy, with nothing to push through', () => {
    expect(conflictFor(blocked)).toEqual({kind: 'blocked', message: 'Claude is working in your terminal right now.'})
  })

  test('asks before sending into a session the terminal has open', () => {
    expect(conflictFor(confirm)).toEqual({kind: 'external', message: 'Claude is open in your terminal.'})
  })

  test('is no conflict at all when the send failed for any other reason', () => {
    expect(conflictFor(new Error('fetch failed'))).toEqual(NO_CONFLICT)
  })
})

describe('a send retried right after taking the session back', () => {
  test('explains the terminal grabbed it again instead of asking to take over forever', () => {
    expect(conflictAfterTakeOver(attached)).toEqual({
      kind: 'take-over-failed',
      message: 'This session is driven from your terminal.',
      reason: TERMINAL_RECONNECTED,
    })
  })

  test('asks in place when the terminal is still working on the conversation', () => {
    expect(conflictAfterTakeOver(blocked)).toEqual({
      kind: 'still-live',
      message: 'Claude is working in your terminal right now.',
    })
    expect(conflictAfterTakeOver(confirm)).toEqual({
      kind: 'still-live',
      message: 'Claude is open in your terminal.',
    })
  })

  test('leaves nothing standing when the retry failed for another reason', () => {
    expect(conflictAfterTakeOver(new Error('fetch failed'))).toEqual(NO_CONFLICT)
  })
})
