import {describe, expect, it} from 'vitest'
import {
  arrivedCount,
  dialInPollMs,
  dialogIsOpen,
  mergeFrozen,
  orderCandidates,
  type Adopted,
} from '../src/composer/connect/connect-steps.js'
import {liveSession} from './helpers/live-session.js'

const adopted: Adopted = {
  concivSessionId: 'conciv_9',
  harnessSessionId: 'sess-1',
  title: 'rename the widget package',
  reloadCommand: '/reload-plugins --force',
}

describe('which steps put a dialog on screen', () => {
  it('keeps the connecting step silent, so a lone session never flashes a dialog', () => {
    expect(dialogIsOpen({kind: 'closed'})).toBe(false)
    expect(dialogIsOpen({kind: 'connecting'})).toBe(false)
  })

  it('shows the dialog for every step the reader has to answer', () => {
    expect(dialogIsOpen({kind: 'picking', error: null, retryId: null})).toBe(true)
    expect(dialogIsOpen({kind: 'reload', adopted})).toBe(true)
    expect(dialogIsOpen({kind: 'leaveConfirm', adopted})).toBe(true)
    expect(dialogIsOpen({kind: 'snippet', command: 'claude --resume tok', detail: 'old'})).toBe(true)
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

describe('the rows a frozen list shows', () => {
  it('shows the live session behind every frozen row', () => {
    const frozen = [liveSession({sessionId: 'a', working: true}), liveSession({sessionId: 'b'})]
    const live = [liveSession({sessionId: 'b', messageCount: 99}), liveSession({sessionId: 'a', working: true})]

    expect(mergeFrozen(frozen, live).map((row) => [row.sessionId, row.messageCount])).toEqual([
      ['a', 12],
      ['b', 99],
    ])
  })

  it('keeps a row that dropped out of the listing and stops it claiming to be working', () => {
    const frozen = [liveSession({sessionId: 'a', working: true}), liveSession({sessionId: 'b', working: true})]

    const rows = mergeFrozen(frozen, [liveSession({sessionId: 'b', working: true})])

    expect(rows.map((row) => [row.sessionId, row.working])).toEqual([
      ['a', false],
      ['b', true],
    ])
  })

  it('counts only the sessions the frozen list has never seen', () => {
    const frozen = [liveSession({sessionId: 'a'})]

    expect(arrivedCount(frozen, [liveSession({sessionId: 'a'}), liveSession({sessionId: 'b'})])).toBe(1)
    expect(arrivedCount(frozen, [liveSession({sessionId: 'a'})])).toBe(0)
    expect(arrivedCount(null, [liveSession({sessionId: 'b'})])).toBe(0)
  })
})

it('backs the dial-in poll off while the server keeps missing, then holds', () => {
  expect(dialInPollMs(0)).toBe(1_500)
  expect(dialInPollMs(1)).toBe(3_000)
  expect(dialInPollMs(2)).toBe(6_000)
  expect(dialInPollMs(9)).toBe(6_000)
})
