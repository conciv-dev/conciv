import type {PluginOptions} from '@conciv/plugin/experimental'
import type {BridgePluginExperimental, BridgePluginExperimentals, Entry} from '@conciv/plugin/experimental/host'

export const PLUGIN_EXPERIMENTAL_INITIAL_TIMEOUT_MS = 10_000

export type LoadedPluginExperimental = {
  readonly id: string
  readonly revision: string
  readonly definition: Entry
  readonly options: PluginOptions
}

type Cache = ReadonlyMap<string, LoadedPluginExperimental>

const EMPTY: Cache = new Map()

export type PluginExperimentalState =
  | {readonly status: 'awaiting'; readonly attempt: number}
  | {
      readonly status: 'evaluating'
      readonly attempt: number

      readonly settled: boolean
      readonly target: BridgePluginExperimentals
      readonly cache: Cache
    }
  | {readonly status: 'loaded'; readonly attempt: number; readonly cache: Cache}
  | {readonly status: 'failed'; readonly attempt: number}
  | {readonly status: 'disposed'}

export type PluginExperimentalEvent =
  | {readonly type: 'initial.resolved'; readonly attempt: number; readonly experimentals: BridgePluginExperimentals}
  | {readonly type: 'initial.failed'; readonly attempt: number; readonly cause: unknown}
  | {readonly type: 'timeout'; readonly attempt: number}
  | {readonly type: 'pushed'; readonly experimentals: BridgePluginExperimentals}
  | {readonly type: 'evaluated'; readonly attempt: number; readonly loaded: readonly LoadedPluginExperimental[]}
  | {readonly type: 'evaluate.failed'; readonly attempt: number; readonly cause: unknown}
  | {readonly type: 'disposed'}

export type PluginExperimentalEffect =
  | {readonly type: 'fetch.initial'; readonly attempt: number}
  | {readonly type: 'timer.start'; readonly attempt: number}
  | {readonly type: 'timer.stop'}
  | {readonly type: 'evaluate'; readonly attempt: number; readonly plugins: readonly BridgePluginExperimental[]}
  | {
      readonly type: 'publish'
      readonly plugins: readonly LoadedPluginExperimental[]
      readonly reserved: readonly string[]
    }
  | {readonly type: 'log'; readonly cause: unknown}

export type PluginExperimentalTransition = {
  readonly state: PluginExperimentalState
  readonly effects: readonly PluginExperimentalEffect[]
}

const TIMER_STOP: PluginExperimentalEffect = {type: 'timer.stop'}

export function createPluginExperimentalState(): PluginExperimentalTransition {
  return {
    state: {status: 'awaiting', attempt: 1},
    effects: [
      {type: 'fetch.initial', attempt: 1},
      {type: 'timer.start', attempt: 1},
    ],
  }
}

export function transitionPluginExperimental(
  state: PluginExperimentalState,
  event: PluginExperimentalEvent,
): PluginExperimentalTransition {
  if (state.status === 'disposed') return {state, effects: []}

  if (event.type === 'disposed')
    return {state: {status: 'disposed'}, effects: state.status === 'awaiting' ? [TIMER_STOP] : []}

  if (state.status === 'awaiting') {
    if (event.type === 'pushed') return receive(state.attempt + 1, false, EMPTY, event.experimentals, true)

    if (event.type !== 'initial.resolved' && event.type !== 'initial.failed' && event.type !== 'timeout')
      return {state, effects: []}

    if (event.attempt !== state.attempt) return {state, effects: []}

    if (event.type === 'initial.resolved') return receive(state.attempt + 1, false, EMPTY, event.experimentals, true)

    return {
      state: {status: 'failed', attempt: state.attempt},
      effects: [
        TIMER_STOP,
        {type: 'publish', plugins: [], reserved: []},
        {
          type: 'log',
          cause: event.type === 'timeout' ? new Error('Main did not list plugin experimentals') : event.cause,
        },
      ],
    }
  }

  if (event.type === 'pushed') {
    if (state.status === 'evaluating')
      return receive(state.attempt + 1, state.settled, state.cache, event.experimentals, false)

    return receive(state.attempt + 1, true, state.status === 'loaded' ? state.cache : EMPTY, event.experimentals, false)
  }

  if (state.status === 'failed' && event.type === 'initial.resolved' && event.attempt === state.attempt)
    return receive(state.attempt + 1, true, EMPTY, event.experimentals, false)

  if (state.status !== 'evaluating') return {state, effects: []}

  if (event.type === 'evaluated' && event.attempt === state.attempt) {
    const fresh = toCache(event.loaded)

    const plugins = state.target.plugins.flatMap((plugin) => {
      const loaded = fresh.get(plugin.id) ?? state.cache.get(plugin.id)

      return loaded ? [loaded] : []
    })

    return {
      state: {status: 'loaded', attempt: state.attempt, cache: toCache(plugins)},
      effects: [{type: 'publish', plugins, reserved: state.target.reserved}],
    }
  }

  if (event.type !== 'evaluate.failed' || event.attempt !== state.attempt) return {state, effects: []}

  if (state.settled)
    return {
      state: {status: 'loaded', attempt: state.attempt, cache: state.cache},
      effects: [{type: 'log', cause: event.cause}],
    }

  return {
    state: {status: 'failed', attempt: state.attempt},
    effects: [
      {type: 'publish', plugins: [], reserved: state.target.reserved},
      {type: 'log', cause: event.cause},
    ],
  }
}

function receive(
  attempt: number,
  settled: boolean,
  cache: Cache,
  experimentals: BridgePluginExperimentals,
  stopTimer: boolean,
): PluginExperimentalTransition {
  const stop = stopTimer ? [TIMER_STOP] : []
  const missing = experimentals.plugins.filter((plugin) => cache.get(plugin.id)?.revision !== plugin.revision)

  if (missing.length > 0)
    return {
      state: {status: 'evaluating', attempt, settled, target: experimentals, cache},
      effects: [...stop, {type: 'evaluate', attempt, plugins: missing}],
    }

  const plugins = experimentals.plugins.flatMap((plugin) => {
    const loaded = cache.get(plugin.id)

    return loaded ? [loaded] : []
  })

  return {
    state: {status: 'loaded', attempt, cache: toCache(plugins)},
    effects: [...stop, {type: 'publish', plugins, reserved: experimentals.reserved}],
  }
}

function toCache(plugins: readonly LoadedPluginExperimental[]): Cache {
  return new Map(plugins.map((plugin) => [plugin.id, plugin]))
}
