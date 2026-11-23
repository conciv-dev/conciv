import {describe, expect, it} from 'vitest'
import {makeRpcClient} from '@conciv/contract'
import {transitionEngines, type EnginesState, type Runner} from './engines.js'

describe('the hub picks the engine an untabbed call runs on', () => {
  const fern = {id: 'fern', pid: 1, root: '/fern', apiBase: 'http://127.0.0.1:4101', token: 'fern-token'}
  const moss = {id: 'moss', pid: 2, root: '/moss', apiBase: 'http://127.0.0.1:4102', token: 'moss-token'}
  const runner: Runner = {root: moss.root, rpc: makeRpcClient(moss.apiBase, {token: moss.token}), described: null}
  const none: EnginesState = {status: 'none'}
  const TOO_OLD = 'engine too old; upgrade its @conciv packages'

  it('picks the first engine that can run code, naming the ones it passed over', () => {
    const listed = transitionEngines(none, {type: 'listed', checked: {live: [fern, moss], unreachable: []}})
    expect(listed).toEqual({
      status: 'picking',
      round: 'first',
      candidates: [fern, moss],
      seen: [fern, moss],
      unusable: [],
      silent: [],
    })
    const passed = transitionEngines(listed, {
      type: 'answered',
      row: fern,
      candidate: {runner: null, unusable: TOO_OLD},
    })
    expect(passed).toMatchObject({status: 'picking', candidates: [moss], unusable: [`/fern (${TOO_OLD})`]})
    expect(transitionEngines(passed, {type: 'answered', row: moss, candidate: {runner, unusable: null}})).toEqual({
      status: 'picked',
      runner,
    })
  })

  it('asks the silent engines once more when none that answered can run code, and tries only the ones that answer now', () => {
    const silent = [{root: '/moss', error: 'timeout'}]
    const listed = transitionEngines(none, {type: 'listed', checked: {live: [fern], unreachable: silent}})
    const passed = transitionEngines(listed, {
      type: 'answered',
      row: fern,
      candidate: {runner: null, unusable: TOO_OLD},
    })
    expect(passed).toEqual({status: 'asking-again', seen: [fern], unusable: [`/fern (${TOO_OLD})`], silent})
    const again = transitionEngines(passed, {type: 'asked-again', checked: {live: [fern, moss], unreachable: []}})
    expect(again).toMatchObject({status: 'picking', round: 'second', candidates: [moss]})
    expect(transitionEngines(again, {type: 'answered', row: moss, candidate: {runner, unusable: null}})).toEqual({
      status: 'picked',
      runner,
    })
  })

  it('names every engine it cannot use and every one still silent after the second ask', () => {
    const silent = [{root: '/moss', error: 'timeout'}]
    const passed = transitionEngines(
      transitionEngines(none, {type: 'listed', checked: {live: [fern], unreachable: silent}}),
      {type: 'answered', row: fern, candidate: {runner: null, unusable: TOO_OLD}},
    )
    expect(transitionEngines(passed, {type: 'asked-again', checked: {live: [fern], unreachable: silent}})).toEqual({
      status: 'unusable',
      reason: `no conciv dev server this hub can use is running: /fern (${TOO_OLD}); /moss did not answer (timeout)`,
    })
    const quiet = transitionEngines(none, {type: 'listed', checked: {live: [], unreachable: silent}})
    expect(transitionEngines(quiet, {type: 'asked-again', checked: {live: [], unreachable: silent}})).toEqual({
      status: 'unusable',
      reason: 'no conciv dev server answered: /moss did not answer (timeout)',
    })
  })
})
