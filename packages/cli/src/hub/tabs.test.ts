import {describe, expect, it} from 'vitest'
import {SessionId} from '@conciv/protocol/chat-types'
import {transitionTab, type TabState} from './tabs.js'

describe('the hub finds the engine holding a tab', () => {
  const tab = SessionId.parse('conciv_shelf')
  const fern = {id: 'fern', pid: 1, root: '/fern', apiBase: 'http://127.0.0.1:4101', token: 'fern-token'}
  const moss = {id: 'moss', pid: 2, root: '/moss', apiBase: 'http://127.0.0.1:4102', token: 'moss-token'}
  const unknown: TabState = {status: 'unknown'}
  const open = (row: typeof fern) => ({row, answer: {open: true}, failure: null})
  const closed = (row: typeof fern) => ({row, answer: {open: false}, failure: null})

  it('owns the tab on the one engine that has it open, whatever the others answered', () => {
    const failing = {row: moss, answer: null, failure: new Error('socket hang up')}
    expect(
      transitionTab(unknown, {
        type: 'probed',
        tab,
        checked: {live: [fern, moss], unreachable: []},
        probes: [open(fern), failing],
      }),
    ).toEqual({status: 'owned', row: fern})
  })

  it('says the tab is not open once every engine answered, and is open on two engines when two have it', () => {
    expect(
      transitionTab(unknown, {type: 'probed', tab, checked: {live: [fern], unreachable: []}, probes: [closed(fern)]}),
    ).toEqual({status: 'failed', error: new Error(`TAB_NOT_OPEN: tab ${tab} is not open; call list_tabs`)})
    expect(
      transitionTab(unknown, {
        type: 'probed',
        tab,
        checked: {live: [fern, moss], unreachable: []},
        probes: [open(fern), open(moss)],
      }),
    ).toEqual({
      status: 'failed',
      error: new Error(
        `tab ${tab} is open on two conciv engines (/fern and /moss); ask the user to close one of the browser tabs`,
      ),
    })
  })

  it('asks a silent or failing engine once more before it says it cannot tell, naming each one', () => {
    const silent = [{root: '/slow', error: 'timeout'}]
    const failing = {row: moss, answer: null, failure: new Error('socket hang up')}
    const finding = transitionTab(unknown, {
      type: 'probed',
      tab,
      checked: {live: [fern, moss], unreachable: silent},
      probes: [closed(fern), failing],
    })
    expect(finding).toEqual({
      status: 'finding',
      first: {live: [fern, moss], unreachable: silent},
      settled: [closed(fern)],
      unsettled: [moss],
    })
    expect(
      transitionTab(finding, {
        type: 'probed-again',
        tab,
        checked: {live: [fern], unreachable: silent},
        probes: [failing],
      }),
    ).toEqual({
      status: 'failed',
      error: new Error(
        `cannot tell whether tab ${tab} is open: no engine that answered has it, and /moss did not answer (socket hang up); /slow did not answer (timeout); nothing ran`,
      ),
    })
    expect(
      transitionTab(finding, {
        type: 'probed-again',
        tab,
        checked: {live: [fern], unreachable: []},
        probes: [open(moss)],
      }),
    ).toEqual({
      status: 'owned',
      row: moss,
    })
  })
})
