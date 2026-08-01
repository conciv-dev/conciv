import {describe, expect, it} from 'vitest'
import {
  CLOSED_CONNECT,
  connectPlanFor,
  connectTransition,
  heldOf,
  type ConnectEvent,
  type ConnectState,
} from '../src/composer/connect/connect-machine.js'
import type {Adopted} from '../src/composer/connect/connect-steps.js'
import {liveSession} from './helpers/live-session.js'

const adopted: Adopted = {
  concivSessionId: 'conciv_9',
  harnessSessionId: 'sess-1',
  title: 'rename the widget package',
  reloadCommand: '/reload-plugins --force',
}

const other = liveSession({sessionId: 'sess-2', title: 'fix the flaky test'})

function run(state: ConnectState, event: ConnectEvent): ConnectState {
  return connectTransition(state, event)
}

describe('opening the picker', () => {
  it('connects a lone session without ever opening a dialog, and asks for the adopt', () => {
    const only = liveSession()
    const after = run(CLOSED_CONNECT, {type: 'open', cached: [only]})

    expect(after.kind).toBe('connecting')
    expect(connectPlanFor(CLOSED_CONNECT, after, {type: 'open', cached: [only]}).adopt?.sessionId).toBe('sess-1')
  })

  it('opens the list for a choice and freezes the rows it opened with', () => {
    const after = run(CLOSED_CONNECT, {type: 'open', cached: [liveSession(), other]})

    expect(after.kind).toBe('picking')
    expect(heldOf(after)?.map((row) => row.sessionId)).toEqual(['sess-1', 'sess-2'])
  })

  it('opens with nothing frozen when no list is cached yet, and decides once the list lands', () => {
    const waiting = run(CLOSED_CONNECT, {type: 'open', cached: null})
    expect(waiting.kind).toBe('picking')
    expect(heldOf(waiting)).toBe(null)

    const decided = run(waiting, {type: 'listed', candidates: [liveSession()]})
    expect(decided.kind).toBe('connecting')
  })

  it('never re-decides once rows are frozen, however many listings arrive after', () => {
    const open = run(CLOSED_CONNECT, {type: 'open', cached: [liveSession(), other]})

    const again = run(open, {type: 'listed', candidates: [liveSession()]})

    expect(again).toBe(open)
  })
})

describe('the attempt recorded in the state that spawned it', () => {
  it('keeps the picker up with the row it is connecting, and asks for that adopt', () => {
    const open = run(CLOSED_CONNECT, {type: 'open', cached: [liveSession(), other]})

    const picked = run(open, {type: 'pick', candidate: other})

    expect(picked.kind).toBe('picking')
    expect(connectPlanFor(open, picked, {type: 'pick', candidate: other}).adopt?.sessionId).toBe('sess-2')
  })

  it('closes and follows the session when the adopt lands ready for the attempt on screen', () => {
    const open = run(CLOSED_CONNECT, {type: 'open', cached: [liveSession(), other]})
    const picked = run(open, {type: 'pick', candidate: other})
    const event: ConnectEvent = {type: 'adopted', candidateId: 'sess-2', adopted, ready: true}

    const after = run(picked, event)

    expect(after).toEqual(CLOSED_CONNECT)
    expect(connectPlanFor(picked, after, event).follow).toEqual(adopted)
    expect(connectPlanFor(picked, after, event).announce).toBe(null)
  })

  it('asks for the reload when the adopted session was started before the install', () => {
    const connecting = run(CLOSED_CONNECT, {type: 'open', cached: [liveSession({ready: false})]})
    const event: ConnectEvent = {type: 'adopted', candidateId: 'sess-1', adopted, ready: false}

    const after = run(connecting, event)

    expect(after.kind).toBe('reload')
    expect(connectPlanFor(connecting, after, event).follow).toBe(null)
  })

  it('says it is following but never navigates when the adopt lands after the reader walked away', () => {
    const connecting = run(CLOSED_CONNECT, {type: 'open', cached: [liveSession()]})
    const walked = run(connecting, {type: 'close'})
    const event: ConnectEvent = {type: 'adopted', candidateId: 'sess-1', adopted, ready: true}

    const after = run(walked, event)

    expect(after).toBe(walked)
    expect(connectPlanFor(walked, after, event).announce).toEqual(adopted)
    expect(connectPlanFor(walked, after, event).follow).toBe(null)
  })

  it('ignores an adopt that answers a row the reader already moved off', () => {
    const open = run(CLOSED_CONNECT, {type: 'open', cached: [liveSession(), other]})
    const picked = run(open, {type: 'pick', candidate: other})
    const moved = run(picked, {type: 'pick', candidate: liveSession()})

    const after = run(moved, {type: 'adopted', candidateId: 'sess-2', adopted, ready: true})

    expect(after).toBe(moved)
  })

  it('keeps the frozen rows when the adopt fails, and offers the row to try again', () => {
    const open = run(CLOSED_CONNECT, {type: 'open', cached: [liveSession(), other]})
    const picked = run(open, {type: 'pick', candidate: other})

    const after = run(picked, {type: 'adoptFailed', candidateId: 'sess-2', message: 'runs elsewhere', snippet: null})

    expect(after).toMatchObject({kind: 'picking', error: 'runs elsewhere', retryId: 'sess-2'})
    expect(heldOf(after)?.map((row) => row.sessionId)).toEqual(['sess-1', 'sess-2'])
  })

  it('degrades to the restart snippet when the install failed and a command came back', () => {
    const connecting = run(CLOSED_CONNECT, {type: 'open', cached: [liveSession()]})

    const after = run(connecting, {
      type: 'adoptFailed',
      candidateId: 'sess-1',
      message: 'claude is too old',
      snippet: 'claude --resume tok',
    })

    expect(after).toEqual({kind: 'snippet', command: 'claude --resume tok', detail: 'claude is too old'})
  })

  it('drops a failure that answers an attempt the flow already left', () => {
    const closed = run(CLOSED_CONNECT, {type: 'open', cached: null})

    const after = run(closed, {type: 'adoptFailed', candidateId: 'sess-2', message: 'too late', snippet: null})

    expect(after).toBe(closed)
  })
})

describe('waiting for the terminal to dial in', () => {
  const waiting: ConnectState = {kind: 'reload', held: null, adopted, dialled: false}

  it('follows the session the moment it dials in, once', () => {
    const after = run(waiting, {type: 'dialledIn'})

    expect(after).toMatchObject({kind: 'reload', dialled: true})
    expect(connectPlanFor(waiting, after, {type: 'dialledIn'}).follow).toEqual(adopted)
    expect(run(after, {type: 'dialledIn'})).toBe(after)
    expect(connectPlanFor(after, after, {type: 'dialledIn'}).follow).toBe(null)
  })

  it('pulls the reader out of the leaving question when the terminal dials in behind it', () => {
    const leaving = run(waiting, {type: 'close'})
    expect(leaving.kind).toBe('leaveConfirm')

    const after = run(leaving, {type: 'dialledIn'})

    expect(after).toMatchObject({kind: 'reload', dialled: true})
    expect(connectPlanFor(leaving, after, {type: 'dialledIn'}).follow).toEqual(adopted)
  })

  it('asks before it lets a half connected terminal go, and hands nothing back until it is answered', () => {
    const event: ConnectEvent = {type: 'close'}
    const leaving = run(waiting, event)

    expect(leaving).toMatchObject({kind: 'leaveConfirm', adopted})
    expect(connectPlanFor(waiting, leaving, event).handBack).toBe(null)
  })

  it('hands the session back when the leaving question is answered that way', () => {
    const leaving = run(waiting, {type: 'close'})
    const event: ConnectEvent = {type: 'close'}

    const after = run(leaving, event)

    expect(after).toEqual(CLOSED_CONNECT)
    expect(connectPlanFor(leaving, after, event).handBack).toEqual(adopted)
  })

  it('goes back to waiting, still holding the session, when the reader keeps waiting', () => {
    const leaving = run(waiting, {type: 'close'})

    const after = run(leaving, {type: 'keepWaiting'})

    expect(after).toMatchObject({kind: 'reload', adopted, dialled: false})
    expect(connectPlanFor(leaving, after, {type: 'keepWaiting'}).handBack).toBe(null)
  })

  it('closes without asking once the terminal has dialled in, because nothing is half done', () => {
    const dialled = run(waiting, {type: 'dialledIn'})

    const after = run(dialled, {type: 'close'})

    expect(after).toEqual(CLOSED_CONNECT)
    expect(connectPlanFor(dialled, after, {type: 'close'}).handBack).toBe(null)
  })

  it('closes for good on done, whatever the terminal is doing', () => {
    expect(run(waiting, {type: 'done'})).toEqual(CLOSED_CONNECT)
  })

  it('goes back to a clean list from the reload card, keeping the rows it froze', () => {
    const open = run(CLOSED_CONNECT, {type: 'open', cached: [liveSession({ready: false}), other]})
    const picked = run(open, {type: 'pick', candidate: other})
    const reload = run(picked, {type: 'adopted', candidateId: 'sess-2', adopted, ready: false})

    const after = run(reload, {type: 'back'})

    expect(after).toMatchObject({kind: 'picking', error: null, retryId: null})
    expect(heldOf(after)?.map((row) => row.sessionId)).toEqual(['sess-1', 'sess-2'])
  })
})

describe('refreshing the frozen rows', () => {
  it('re-freezes the list the reader asked to see, in the order it arrived', () => {
    const open = run(CLOSED_CONNECT, {type: 'open', cached: [liveSession(), other]})
    const third = liveSession({sessionId: 'sess-3', lastActivityAt: Date.now()})

    const after = run(open, {type: 'refreshed', candidates: [liveSession(), other, third]})

    expect(heldOf(after)?.map((row) => row.sessionId)).toEqual(['sess-3', 'sess-1', 'sess-2'])
    expect(after.kind).toBe('picking')
  })

  it('never re-freezes rows for a flow that is closed', () => {
    const after = run(CLOSED_CONNECT, {type: 'refreshed', candidates: [liveSession()]})

    expect(after).toBe(CLOSED_CONNECT)
  })
})
