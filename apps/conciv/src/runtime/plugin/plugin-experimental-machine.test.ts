import {describe, expect, test} from 'vitest'
import type {BridgePluginExperimental, BridgePluginExperimentals} from '@conciv/plugin/experimental/host'
import {
  createPluginExperimentalState,
  transitionPluginExperimental,
  type LoadedPluginExperimental,
  type PluginExperimentalEffect,
  type PluginExperimentalEvent,
  type PluginExperimentalState,
} from './plugin-experimental-machine'

const experimental = (id: string, revision: string): BridgePluginExperimental => ({id, revision, code: '', options: {}})

const experimentals = (plugins: BridgePluginExperimental[], reserved: string[] = []): BridgePluginExperimentals => ({
  plugins,
  reserved,
})

const evaluated = (plugin: BridgePluginExperimental): LoadedPluginExperimental => ({
  id: plugin.id,
  revision: plugin.revision,
  options: plugin.options,
  definition: {id: plugin.id},
})

function run(
  events: PluginExperimentalEvent[],
  state: PluginExperimentalState = createPluginExperimentalState().state,
) {
  return events.reduce<{state: PluginExperimentalState; effects: PluginExperimentalEffect[]}>(
    (current, event) => {
      const next = transitionPluginExperimental(current.state, event)

      return {state: next.state, effects: [...current.effects, ...next.effects]}
    },
    {state, effects: []},
  )
}

function published(effects: readonly PluginExperimentalEffect[]) {
  return effects.flatMap((effect) =>
    effect.type === 'publish' ? [effect.plugins.map((plugin) => `${plugin.id}@${plugin.revision}`)] : [],
  )
}

describe('plugin experimental machine', () => {
  test('starts the first request with its timeout', () => {
    expect(createPluginExperimentalState()).toEqual({
      state: {status: 'awaiting', attempt: 1},
      effects: [
        {type: 'fetch.initial', attempt: 1},
        {type: 'timer.start', attempt: 1},
      ],
    })
  })

  test('a rejected first request settles with no plugins, and a later push recovers', () => {
    const failed = run([{type: 'initial.failed', attempt: 1, cause: new Error('ipc')}])

    expect(failed.state.status).toBe('failed')
    expect(failed.effects).toContainEqual({type: 'timer.stop'})
    expect(published(failed.effects)).toEqual([[]])

    const acme = experimental('acme', 'r1')
    const pushed = transitionPluginExperimental(failed.state, {type: 'pushed', experimentals: experimentals([acme])})

    expect(pushed.state).toMatchObject({status: 'evaluating', settled: true})

    const loaded = transitionPluginExperimental(pushed.state, {
      type: 'evaluated',
      attempt: pushed.state.status === 'evaluating' ? pushed.state.attempt : 0,
      loaded: [evaluated(acme)],
    })

    expect(published(loaded.effects)).toEqual([['acme@r1']])
  })

  test('a first request main never answers times out and settles', () => {
    const timedOut = run([{type: 'timeout', attempt: 1}])

    expect(timedOut.state.status).toBe('failed')
    expect(published(timedOut.effects)).toEqual([[]])

    const late = transitionPluginExperimental(timedOut.state, {
      type: 'initial.resolved',
      attempt: 1,
      experimentals: experimentals([experimental('acme', 'r1')]),
    })

    expect(late.state.status).toBe('evaluating')
  })

  test('a push before the first reply wins, and the late reply is ignored', () => {
    const pushed = run([{type: 'pushed', experimentals: experimentals([], ['file'])}])

    expect(pushed.effects).toEqual([{type: 'timer.stop'}, {type: 'publish', plugins: [], reserved: ['file']}])

    const late = transitionPluginExperimental(pushed.state, {
      type: 'initial.resolved',
      attempt: 1,
      experimentals: experimentals([experimental('acme', 'r1')]),
    })

    expect(late.state).toBe(pushed.state)
    expect(late.effects).toEqual([])
  })

  test('a slow evaluation of an older push never lands over a newer one', () => {
    const r1 = experimental('acme', 'r1')
    const r2 = experimental('acme', 'r2')
    const first = run([{type: 'initial.resolved', attempt: 1, experimentals: experimentals([r1])}])
    const second = transitionPluginExperimental(first.state, {type: 'pushed', experimentals: experimentals([r2])})
    const fast = transitionPluginExperimental(second.state, {type: 'evaluated', attempt: 3, loaded: [evaluated(r2)]})

    expect(published(fast.effects)).toEqual([['acme@r2']])

    const slow = transitionPluginExperimental(fast.state, {type: 'evaluated', attempt: 2, loaded: [evaluated(r1)]})

    expect(slow.state).toBe(fast.state)
    expect(slow.effects).toEqual([])
    expect(fast.state.status === 'loaded' && fast.state.cache.get('acme')?.revision).toBe('r2')
  })

  test('a removed plugin is not brought back by a slower evaluation', () => {
    const r1 = experimental('acme', 'r1')
    const first = run([{type: 'initial.resolved', attempt: 1, experimentals: experimentals([r1])}])
    const removed = transitionPluginExperimental(first.state, {type: 'pushed', experimentals: experimentals([])})

    expect(published(removed.effects)).toEqual([[]])

    const slow = transitionPluginExperimental(removed.state, {type: 'evaluated', attempt: 2, loaded: [evaluated(r1)]})

    expect(slow.state).toBe(removed.state)
    expect(removed.state.status === 'loaded' && removed.state.cache.size).toBe(0)
  })

  test('an unchanged revision publishes the cached definition without evaluating', () => {
    const acme = experimental('acme', 'r1')
    const definition = evaluated(acme)

    const loaded = run([
      {type: 'initial.resolved', attempt: 1, experimentals: experimentals([acme])},
      {type: 'evaluated', attempt: 2, loaded: [definition]},
    ])

    const again = transitionPluginExperimental(loaded.state, {
      type: 'pushed',
      experimentals: experimentals([acme], ['x']),
    })

    expect(again.effects).toEqual([{type: 'publish', plugins: [definition], reserved: ['x']}])
  })

  test('a first evaluation that fails settles empty, keeping the reserved ids', () => {
    const failed = run([
      {type: 'initial.resolved', attempt: 1, experimentals: experimentals([experimental('acme', 'r1')], ['file'])},
      {type: 'evaluate.failed', attempt: 2, cause: new Error('chunk')},
    ])

    expect(failed.state.status).toBe('failed')
    expect(failed.effects).toContainEqual({type: 'publish', plugins: [], reserved: ['file']})
  })

  test('a reload that fails keeps the plugins that already run', () => {
    const r1 = experimental('acme', 'r1')

    const loaded = run([
      {type: 'initial.resolved', attempt: 1, experimentals: experimentals([r1])},
      {type: 'evaluated', attempt: 2, loaded: [evaluated(r1)]},
    ])

    const reload = run(
      [
        {type: 'pushed', experimentals: experimentals([experimental('acme', 'r2')])},
        {type: 'evaluate.failed', attempt: 3, cause: new Error('chunk')},
      ],
      loaded.state,
    )

    expect(reload.state.status === 'loaded' && reload.state.cache.get('acme')?.revision).toBe('r1')
    expect(published(reload.effects)).toEqual([])
  })

  test('disposal stops the timer and ignores late results', () => {
    const disposed = transitionPluginExperimental(createPluginExperimentalState().state, {type: 'disposed'})

    expect(disposed).toEqual({state: {status: 'disposed'}, effects: [{type: 'timer.stop'}]})

    const late = transitionPluginExperimental(disposed.state, {
      type: 'initial.resolved',
      attempt: 1,
      experimentals: experimentals([]),
    })

    expect(late.state).toBe(disposed.state)
    expect(late.effects).toEqual([])
  })
})
