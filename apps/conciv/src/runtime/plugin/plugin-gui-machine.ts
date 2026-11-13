import type {PluginOptions} from '@conciv/plugin/experimental'
import type {BridgePluginGui, BridgePluginGuis, Entry} from '@conciv/plugin/experimental/host'

export const PLUGIN_GUI_INITIAL_TIMEOUT_MS = 10_000

export type LoadedPluginGui = {
  readonly id: string
  readonly revision: string
  readonly definition: Entry
  readonly options: PluginOptions
}

type Cache = ReadonlyMap<string, LoadedPluginGui>

const EMPTY: Cache = new Map()

export type PluginGuiState =
  | {readonly status: 'awaiting'; readonly attempt: number}
  | {
      readonly status: 'evaluating'
      readonly attempt: number

      readonly settled: boolean
      readonly target: BridgePluginGuis
      readonly cache: Cache
    }
  | {readonly status: 'loaded'; readonly attempt: number; readonly cache: Cache}
  | {readonly status: 'failed'; readonly attempt: number}
  | {readonly status: 'disposed'}

export type PluginGuiEvent =
  | {readonly type: 'initial.resolved'; readonly attempt: number; readonly guis: BridgePluginGuis}
  | {readonly type: 'initial.failed'; readonly attempt: number; readonly cause: unknown}
  | {readonly type: 'timeout'; readonly attempt: number}
  | {readonly type: 'pushed'; readonly guis: BridgePluginGuis}
  | {readonly type: 'evaluated'; readonly attempt: number; readonly loaded: readonly LoadedPluginGui[]}
  | {readonly type: 'evaluate.failed'; readonly attempt: number; readonly cause: unknown}
  | {readonly type: 'disposed'}

export type PluginGuiEffect =
  | {readonly type: 'fetch.initial'; readonly attempt: number}
  | {readonly type: 'timer.start'; readonly attempt: number}
  | {readonly type: 'timer.stop'}
  | {readonly type: 'evaluate'; readonly attempt: number; readonly plugins: readonly BridgePluginGui[]}
  | {readonly type: 'publish'; readonly plugins: readonly LoadedPluginGui[]; readonly reserved: readonly string[]}
  | {readonly type: 'log'; readonly cause: unknown}

export type PluginGuiTransition = {
  readonly state: PluginGuiState
  readonly effects: readonly PluginGuiEffect[]
}

const TIMER_STOP: PluginGuiEffect = {type: 'timer.stop'}

export function createPluginGuiState(): PluginGuiTransition {
  return {
    state: {status: 'awaiting', attempt: 1},
    effects: [
      {type: 'fetch.initial', attempt: 1},
      {type: 'timer.start', attempt: 1},
    ],
  }
}

export function transitionPluginGui(state: PluginGuiState, event: PluginGuiEvent): PluginGuiTransition {
  if (state.status === 'disposed') return {state, effects: []}

  if (event.type === 'disposed')
    return {state: {status: 'disposed'}, effects: state.status === 'awaiting' ? [TIMER_STOP] : []}

  if (state.status === 'awaiting') {
    if (event.type === 'pushed') return receive(state.attempt + 1, false, EMPTY, event.guis, true)

    if (event.type !== 'initial.resolved' && event.type !== 'initial.failed' && event.type !== 'timeout')
      return {state, effects: []}

    if (event.attempt !== state.attempt) return {state, effects: []}

    if (event.type === 'initial.resolved') return receive(state.attempt + 1, false, EMPTY, event.guis, true)

    return {
      state: {status: 'failed', attempt: state.attempt},
      effects: [
        TIMER_STOP,
        {type: 'publish', plugins: [], reserved: []},
        {type: 'log', cause: event.type === 'timeout' ? new Error('Main did not list plugin GUIs') : event.cause},
      ],
    }
  }

  if (event.type === 'pushed') {
    if (state.status === 'evaluating') return receive(state.attempt + 1, state.settled, state.cache, event.guis, false)

    return receive(state.attempt + 1, true, state.status === 'loaded' ? state.cache : EMPTY, event.guis, false)
  }

  if (state.status === 'failed' && event.type === 'initial.resolved' && event.attempt === state.attempt)
    return receive(state.attempt + 1, true, EMPTY, event.guis, false)

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
  guis: BridgePluginGuis,
  stopTimer: boolean,
): PluginGuiTransition {
  const stop = stopTimer ? [TIMER_STOP] : []
  const missing = guis.plugins.filter((plugin) => cache.get(plugin.id)?.revision !== plugin.revision)

  if (missing.length > 0)
    return {
      state: {status: 'evaluating', attempt, settled, target: guis, cache},
      effects: [...stop, {type: 'evaluate', attempt, plugins: missing}],
    }

  const plugins = guis.plugins.flatMap((plugin) => {
    const loaded = cache.get(plugin.id)

    return loaded ? [loaded] : []
  })

  return {
    state: {status: 'loaded', attempt, cache: toCache(plugins)},
    effects: [...stop, {type: 'publish', plugins, reserved: guis.reserved}],
  }
}

function toCache(plugins: readonly LoadedPluginGui[]): Cache {
  return new Map(plugins.map((plugin) => [plugin.id, plugin]))
}
