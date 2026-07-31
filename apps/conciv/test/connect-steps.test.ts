import {describe, expect, it} from 'vitest'
import {
  dialInPollMs,
  dialogIsOpen,
  orderCandidates,
  stepOnAdoptFailed,
  stepOnAdopted,
  stepOnBack,
  stepOnKeepWaiting,
  stepOnLeave,
  stepOnOpen,
  type Adopted,
} from '../src/composer/connect/connect-steps.js'
import {liveSession} from './helpers/live-session.js'

const adopted: Adopted = {
  concivSessionId: 'conciv_9',
  harnessSessionId: 'sess-1',
  title: 'rename the widget package',
  reloadCommand: '/reload-plugins --force',
}

describe('opening the picker', () => {
  it('never shows a dialog for a single ready session, it just connects', () => {
    const step = stepOnOpen([liveSession()])
    expect(step.kind).toBe('connecting')
    expect(dialogIsOpen(step)).toBe(false)
  })

  it('connects a single session that is not ready yet too, because reload needs the adopt result first', () => {
    const step = stepOnOpen([liveSession({ready: false})])
    expect(step.kind).toBe('connecting')
    expect(dialogIsOpen(step)).toBe(false)
  })

  it('opens the list for nothing and for a choice', () => {
    expect(stepOnOpen([]).kind).toBe('picking')
    expect(dialogIsOpen(stepOnOpen([]))).toBe(true)
    expect(stepOnOpen([liveSession(), liveSession({sessionId: 'sess-2'})]).kind).toBe('picking')
  })
})

describe('what happens once the server answers the adopt', () => {
  it('closes on a ready session', () => {
    expect(stepOnAdopted(adopted, true)).toEqual({kind: 'closed'})
  })

  it('shows the reload card built from the adopt result, not from the row', () => {
    const step = stepOnAdopted(adopted, false)
    expect(step).toEqual({kind: 'reload', adopted})
  })

  it('degrades to the restart snippet only when the install failed and a command came back', () => {
    const failed = stepOnAdoptFailed({message: 'claude is too old', sessionId: 'sess-1'}, 'claude --resume tok')
    expect(failed).toEqual({kind: 'snippet', command: 'claude --resume tok', detail: 'claude is too old'})
  })

  it('keeps the list up with the reason and the row to retry when there is no snippet', () => {
    const failed = stepOnAdoptFailed({message: 'that session runs elsewhere', sessionId: 'sess-2'}, null)
    expect(failed).toEqual({kind: 'picking', error: 'that session runs elsewhere', retryId: 'sess-2'})
  })

  it('goes back to a clean list from the reload card', () => {
    expect(stepOnBack()).toEqual({kind: 'picking', error: null, retryId: null})
  })
})

describe('leaving the reload card', () => {
  it('asks before it lets a half-connected terminal go', () => {
    const step = stepOnLeave({kind: 'reload', adopted}, false)
    expect(step).toEqual({kind: 'leaveConfirm', adopted})
    expect(dialogIsOpen(step)).toBe(true)
  })

  it('just closes once the terminal has dialled in, because nothing is half done', () => {
    expect(stepOnLeave({kind: 'reload', adopted}, true)).toEqual({kind: 'closed'})
  })

  it('closes straight away from every other step', () => {
    expect(stepOnLeave({kind: 'picking', error: null, retryId: null}, false)).toEqual({kind: 'closed'})
    expect(stepOnLeave({kind: 'snippet', command: 'claude --resume tok', detail: 'old'}, false)).toEqual({
      kind: 'closed',
    })
  })

  it('goes back to waiting with the same session when the reader keeps waiting', () => {
    expect(stepOnKeepWaiting({kind: 'leaveConfirm', adopted})).toEqual({kind: 'reload', adopted})
  })
})

describe('the order rows are shown in', () => {
  it('puts the most recently active first and breaks ties by id, so a refetch never reshuffles', () => {
    const rows = [
      liveSession({sessionId: 'b', lastActivityAt: 100}),
      liveSession({sessionId: 'a', lastActivityAt: 100}),
      liveSession({sessionId: 'c', lastActivityAt: 300}),
    ]
    expect(orderCandidates(rows).map((row) => row.sessionId)).toEqual(['c', 'a', 'b'])
    expect(orderCandidates(rows.toReversed()).map((row) => row.sessionId)).toEqual(['c', 'a', 'b'])
  })
})

it('backs the dial-in poll off while the server keeps missing, then holds', () => {
  expect(dialInPollMs(0)).toBe(1_500)
  expect(dialInPollMs(1)).toBe(3_000)
  expect(dialInPollMs(2)).toBe(6_000)
  expect(dialInPollMs(9)).toBe(6_000)
})
