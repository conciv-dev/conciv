import {expect, test} from 'vitest'
import {
  IDLE_SEND,
  planFor,
  transition,
  type SendAttempt,
  type SendEvent,
  type SendState,
} from '../src/chat/send-machine.js'
import {ATTACHED_MESSAGE, TERMINAL_RECONNECTED} from '../src/chat/conflict.js'

function attempt(id: number): SendAttempt {
  return {id, content: `message ${id}`, draft: null, grabs: []}
}

function rpcError(code: string, message: string): Error {
  return Object.assign(new Error(message), {code})
}

const ATTACHED = rpcError('SESSION_ATTACHED', 'This session is driven from your terminal.')
const CONFIRM = rpcError('EXTERNAL_CONFIRM', 'Claude is open in your terminal.')
const BLOCKED = rpcError('EXTERNAL_BLOCKED', 'Claude is working in your terminal right now.')
const OFFLINE = new Error('Failed to fetch')

function run(events: SendEvent[], from: SendState = IDLE_SEND): SendState {
  return events.reduce(transition, from)
}

const sent = (id: number, attached = false): SendEvent => ({type: 'send', attempt: attempt(id), attached})
const rejected = (error: unknown, delivered = false): SendEvent => ({type: 'rejected', error, delivered})

test('a send to a free session goes straight out', () => {
  expect(run([sent(1)])).toEqual({kind: 'sending', attempt: attempt(1), origin: 'fresh'})
})

test('a send to a session held by the terminal asks before it goes anywhere', () => {
  expect(run([sent(1, true)])).toEqual({
    kind: 'conflict',
    attempt: attempt(1),
    conflict: {kind: 'attached', message: ATTACHED_MESSAGE},
  })
})

test('a rejection the terminal explains becomes the question, and keeps the message to send', () => {
  const state = run([sent(1), rejected(CONFIRM)])

  expect(state).toEqual({
    kind: 'conflict',
    attempt: attempt(1),
    conflict: {kind: 'external', message: 'Claude is open in your terminal.'},
  })
})

test('a rejection nobody can explain hands the message back instead of asking', () => {
  expect(run([sent(1), rejected(OFFLINE)])).toEqual({kind: 'failed', attempt: attempt(1), error: OFFLINE})
})

test('a rejection that arrives after the message landed ends the send instead of stranding the question', () => {
  expect(run([sent(1), rejected(CONFIRM), rejected(CONFIRM, true)])).toEqual({kind: 'sent'})
})

test('a failure that arrives while the question is up leaves the question answerable', () => {
  const asked = run([sent(1), rejected(CONFIRM)])

  expect(transition(asked, rejected(OFFLINE))).toEqual(asked)
})

test('sending anyway sends the very message the question was about', () => {
  expect(run([sent(1), rejected(CONFIRM), {type: 'sendAnyway'}])).toEqual({
    kind: 'sending',
    attempt: attempt(1),
    origin: 'force',
  })
})

test('taking over waits for the terminal to let go, then retries the same message', () => {
  const takingOver = run([sent(1, true), {type: 'takeOver'}])
  expect(takingOver).toEqual({
    kind: 'conflict',
    attempt: attempt(1),
    conflict: {kind: 'taking-over', message: ATTACHED_MESSAGE},
  })

  expect(transition(takingOver, {type: 'detachSettled', attemptId: 1})).toEqual({
    kind: 'sending',
    attempt: attempt(1),
    origin: 'take-over',
  })
})

test('a terminal that grabs the session back mid-retry is explained, not asked about again', () => {
  const state = run([sent(1, true), {type: 'takeOver'}, {type: 'detachSettled', attemptId: 1}, rejected(ATTACHED)])

  expect(state).toEqual({
    kind: 'conflict',
    attempt: attempt(1),
    conflict: {kind: 'take-over-failed', message: ATTACHED.message, reason: TERMINAL_RECONNECTED},
  })
})

test('a terminal still working after it let go asks once more instead of retrying forever', () => {
  const state = run([sent(1, true), {type: 'takeOver'}, {type: 'detachSettled', attemptId: 1}, rejected(BLOCKED)])

  expect(state).toEqual({
    kind: 'conflict',
    attempt: attempt(1),
    conflict: {kind: 'still-live', message: BLOCKED.message},
  })
})

test('a hand-back the server refused is reported on the question that asked for it', () => {
  const state = run([sent(1, true), {type: 'takeOver'}, {type: 'takeOverFailed', attemptId: 1, reason: 'network down'}])

  expect(state).toEqual({
    kind: 'conflict',
    attempt: attempt(1),
    conflict: {kind: 'take-over-failed', message: ATTACHED_MESSAGE, reason: 'network down'},
  })
})

test('a hand-back that lands after the reader gave up changes nothing', () => {
  const abandoned = run([sent(1, true), {type: 'takeOver'}, {type: 'cancel'}])

  expect(abandoned).toEqual(IDLE_SEND)
  expect(transition(abandoned, {type: 'detachSettled', attemptId: 1})).toEqual(IDLE_SEND)
  expect(transition(abandoned, {type: 'takeOverFailed', attemptId: 1, reason: 'network down'})).toEqual(IDLE_SEND)
})

test('a delivery belonging to an abandoned attempt never ends the message that replaced it', () => {
  const resent = run([sent(1), {type: 'cancel'}, sent(2)])

  expect(transition(resent, {type: 'delivered', attemptId: 1})).toEqual(resent)
  expect(transition(resent, {type: 'delivered', attemptId: 2})).toEqual({kind: 'sent'})
})

function planned(events: SendEvent[], last: SendEvent, from: SendState = IDLE_SEND) {
  const before = run(events, from)
  return planFor(before, transition(before, last), last)
}

test('a message goes to the server exactly once per answer the reader gives', () => {
  const first = planned([], sent(1))
  expect(first.starting).toEqual({attempt: attempt(1), force: false})

  const forced = planned([sent(1), rejected(CONFIRM)], {type: 'sendAnyway'})
  expect(forced.starting).toEqual({attempt: attempt(1), force: true})

  const asking = planned([sent(1, true)], {type: 'takeOver'})
  expect(asking.starting).toBeNull()
  expect(asking.handing).toEqual(attempt(1))
})

test('giving up hands the message back to the composer and the keyboard with it', () => {
  const plan = planned([sent(1, true)], {type: 'cancel'})

  expect(plan.abandoned).toEqual(attempt(1))
  expect(plan.cancelled).toBe(true)
  expect(plan.starting).toBeNull()
})

test('a message that landed clears its grabs, a message that failed comes back instead', () => {
  const landed = planned([sent(1)], {type: 'delivered', attemptId: 1})
  expect(landed.cleared).toBe(true)
  expect(landed.failure).toBeNull()

  const lost = planned([sent(1)], rejected(OFFLINE))
  expect(lost.cleared).toBe(false)
  expect(lost.failure).toEqual({attempt: attempt(1), error: OFFLINE})
})

test('a hand-back already under way is never asked for twice', () => {
  const asked = run([sent(1, true), {type: 'takeOver'}])

  expect(planFor(asked, transition(asked, {type: 'takeOver'}), {type: 'takeOver'}).handing).toBeNull()
})
