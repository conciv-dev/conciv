import {describe, expect, it} from 'vitest'
import {makeRpcClient} from '@conciv/contract'
import {transitionEngines, type EnginesEvent, type EnginesState, type Runner} from './engines.js'

describe('the hub picks the engine an untabbed call runs on', () => {
  it('picks the first engine that can run code naming the ones it passed over, asks the silent engines once more when none that answered can run code and tries only the ones that answer now, and names every engine it cannot use and every one still silent after the second ask', () => {
    const fern = {id: 'fern', pid: 1, root: '/fern', apiBase: 'http://127.0.0.1:4101', token: 'fern-token'}
    const moss = {id: 'moss', pid: 2, root: '/moss', apiBase: 'http://127.0.0.1:4102', token: 'moss-token'}
    const runner: Runner = {root: moss.root, rpc: makeRpcClient(moss.apiBase, {token: moss.token}), described: null}
    const none: EnginesState = {status: 'none'}
    const TOO_OLD = 'engine too old; upgrade its @conciv packages'
    const silent = [{root: '/moss', error: 'timeout'}]
    const fernTooOld = `/fern (${TOO_OLD})`
    const tooOld: EnginesEvent = {type: 'answered', row: fern, candidate: {runner: null, unusable: TOO_OLD}}
    const mossRuns: EnginesEvent = {type: 'answered', row: moss, candidate: {runner, unusable: null}}
    const bothListed: EnginesState = {
      status: 'picking',
      round: 'first',
      candidates: [fern, moss],
      seen: [fern, moss],
      unusable: [],
      silent: [],
    }
    const passedFern: EnginesState = {
      status: 'picking',
      round: 'first',
      candidates: [moss],
      seen: [fern, moss],
      unusable: [fernTooOld],
      silent: [],
    }
    const fernListed: EnginesState = {
      status: 'picking',
      round: 'first',
      candidates: [fern],
      seen: [fern],
      unusable: [],
      silent,
    }
    const askingAgain: EnginesState = {status: 'asking-again', seen: [fern], unusable: [fernTooOld], silent}
    const secondRound: EnginesState = {
      status: 'picking',
      round: 'second',
      candidates: [moss],
      seen: [fern],
      unusable: [fernTooOld],
      silent: [],
    }
    const quiet: EnginesState = {status: 'asking-again', seen: [], unusable: [], silent}
    const rows: [string, EnginesState, EnginesEvent, EnginesState][] = [
      ['lists two engines', none, {type: 'listed', checked: {live: [fern, moss], unreachable: []}}, bothListed],
      ['passes over the too-old engine', bothListed, tooOld, passedFern],
      ['picks the engine that runs code', passedFern, mossRuns, {status: 'picked', runner}],
      [
        'lists one engine and a silent one',
        none,
        {type: 'listed', checked: {live: [fern], unreachable: silent}},
        fernListed,
      ],
      ['asks again once none answered usable', fernListed, tooOld, askingAgain],
      [
        'tries only the engine that answers now',
        askingAgain,
        {type: 'asked-again', checked: {live: [fern, moss], unreachable: []}},
        secondRound,
      ],
      ['picks the engine of the second round', secondRound, mossRuns, {status: 'picked', runner}],
      [
        'names the unusable and the still silent engines',
        askingAgain,
        {type: 'asked-again', checked: {live: [fern], unreachable: silent}},
        {
          status: 'unusable',
          reason: `no conciv dev server this hub can use is running: /fern (${TOO_OLD}); /moss did not answer (timeout)`,
        },
      ],
      ['lists only a silent engine', none, {type: 'listed', checked: {live: [], unreachable: silent}}, quiet],
      [
        'names the engine still silent after the second ask',
        quiet,
        {type: 'asked-again', checked: {live: [], unreachable: silent}},
        {status: 'unusable', reason: 'no conciv dev server answered: /moss did not answer (timeout)'},
      ],
    ]

    for (const [step, from, event, expected] of rows) expect(transitionEngines(from, event), step).toEqual(expected)
  })
})
