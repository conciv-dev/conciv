import {describe, expect, it} from 'vitest'
import {SessionId} from '@conciv/protocol/chat-types'
import {transitionTab, type TabEvent, type TabState} from './tabs.js'

describe('the hub finds the engine holding a tab', () => {
  it('owns the tab on the one engine that has it open whatever the others answered, says the tab is not open once every engine answered or is open on two engines when two have it, and asks a silent or failing engine once more before it says it cannot tell, naming each one', () => {
    const tab = SessionId.parse('conciv_shelf')
    const fern = {id: 'fern', pid: 1, root: '/fern', apiBase: 'http://127.0.0.1:4101', token: 'fern-token'}
    const moss = {id: 'moss', pid: 2, root: '/moss', apiBase: 'http://127.0.0.1:4102', token: 'moss-token'}
    const unknown: TabState = {status: 'unknown'}
    const open = (row: typeof fern) => ({row, answer: {open: true}, failure: null})
    const closed = (row: typeof fern) => ({row, answer: {open: false}, failure: null})
    const failing = {row: moss, answer: null, failure: new Error('socket hang up')}
    const silent = [{root: '/slow', error: 'timeout'}]
    const finding: TabState = {
      status: 'finding',
      first: {live: [fern, moss], unreachable: silent},
      settled: [closed(fern)],
      unsettled: [moss],
    }
    const rows: [string, TabState, TabEvent, TabState][] = [
      [
        'owns the tab on the one engine that has it open',
        unknown,
        {type: 'probed', tab, checked: {live: [fern, moss], unreachable: []}, probes: [open(fern), failing]},
        {status: 'owned', row: fern},
      ],
      [
        'says the tab is not open once every engine answered',
        unknown,
        {type: 'probed', tab, checked: {live: [fern], unreachable: []}, probes: [closed(fern)]},
        {status: 'failed', error: new Error(`TAB_NOT_OPEN: tab ${tab} is not open; call list_tabs`)},
      ],
      [
        'says the tab is open on two engines',
        unknown,
        {type: 'probed', tab, checked: {live: [fern, moss], unreachable: []}, probes: [open(fern), open(moss)]},
        {
          status: 'failed',
          error: new Error(
            `tab ${tab} is open on two conciv engines (/fern and /moss); ask the user to close one of the browser tabs`,
          ),
        },
      ],
      [
        'keeps finding while an engine is silent or failing',
        unknown,
        {type: 'probed', tab, checked: {live: [fern, moss], unreachable: silent}, probes: [closed(fern), failing]},
        finding,
      ],
      [
        'cannot tell once the second ask fails too, naming each engine',
        finding,
        {type: 'probed-again', tab, checked: {live: [fern], unreachable: silent}, probes: [failing]},
        {
          status: 'failed',
          error: new Error(
            `cannot tell whether tab ${tab} is open: no engine that answered has it, and /moss did not answer (socket hang up); /slow did not answer (timeout); nothing ran`,
          ),
        },
      ],
      [
        'owns the tab on the engine that answers the second ask',
        finding,
        {type: 'probed-again', tab, checked: {live: [fern], unreachable: []}, probes: [open(moss)]},
        {status: 'owned', row: moss},
      ],
    ]

    for (const [step, from, event, expected] of rows) expect(transitionTab(from, event), step).toEqual(expected)
  })
})
