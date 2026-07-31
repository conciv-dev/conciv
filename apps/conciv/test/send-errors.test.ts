import {expect, test} from 'vitest'
import {sendBlockedMessage, sendConfirmMessage, sessionAttachedMessage} from '../src/chat/send-errors.js'

test('tells a blocked send apart from one that only needs confirming', () => {
  const blocked = {code: 'EXTERNAL_BLOCKED', message: 'Claude is working in your terminal right now.'}
  const confirm = {code: 'EXTERNAL_CONFIRM', message: 'Claude is open in your terminal.'}

  expect(sendBlockedMessage(new Error('nope'))).toBeNull()
  expect(sendBlockedMessage(blocked)).toBe('Claude is working in your terminal right now.')
  expect(sendConfirmMessage(blocked)).toBeNull()

  expect(sendConfirmMessage(confirm)).toBe('Claude is open in your terminal.')
  expect(sendBlockedMessage(confirm)).toBeNull()
  expect(sendConfirmMessage({cause: {code: 'EXTERNAL_CONFIRM', message: 'nested'}})).toBe('nested')
})

test('falls back to plain words when the server sent a code with no message', () => {
  expect(sessionAttachedMessage({code: 'SESSION_ATTACHED', message: ''})).toBe(
    'This session is driven from your terminal.',
  )
  expect(sessionAttachedMessage({code: 'EXTERNAL_BLOCKED', message: 'busy'})).toBeNull()
})
