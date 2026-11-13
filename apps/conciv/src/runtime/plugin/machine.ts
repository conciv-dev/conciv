import {pluginEnabled, type EnableState, type Installed} from '@conciv/plugin/experimental/host'

export type ListRequest = {readonly status: 'loading'} | {readonly status: 'failed'; readonly error: string}

export type Preferences =
  | {readonly status: 'loaded'; readonly preload: readonly EnableState[]; readonly list: readonly Installed[]}
  | {readonly status: 'preload'; readonly rows: readonly EnableState[]; readonly list: ListRequest}
  | {readonly status: 'unknown'; readonly list: ListRequest}

export type PendingPreferences =
  | {readonly kind: 'both'}
  | {readonly kind: 'list'}
  | {readonly kind: 'preload'; readonly error: string}

export type Inventory = 'none' | 'loading' | 'settled'

export type StartupGateState =
  | {
      readonly status: 'preferences'
      readonly pending: PendingPreferences

      readonly plugins: readonly string[]
      readonly inventory: Inventory
    }
  | {
      readonly status: 'activating'
      readonly pending: readonly string[]
      readonly preferences: Preferences
      readonly inventory: Inventory
    }
  | {
      readonly status: 'servers'
      readonly pending: 'both' | 'inventory' | 'sources'
      readonly preferences: Preferences
    }
  | {readonly status: 'ready'; readonly preferences: Preferences}

export type StartupGateTimer = 'preferences' | 'activation' | 'servers'

export type StartupGateEvent =
  | {readonly type: 'preload.resolved'; readonly rows: readonly EnableState[]}
  | {readonly type: 'preload.unavailable'}
  | {readonly type: 'list.resolved'; readonly list: readonly Installed[]}
  | {readonly type: 'list.failed'; readonly error: string}
  | {readonly type: 'installed.pushed'; readonly list: readonly Installed[]}
  | {readonly type: 'plugin.settled'; readonly id: string}
  | {readonly type: 'inventory.settled'}
  | {readonly type: 'sources.settled'}
  | {readonly type: 'timeout'; readonly timer: StartupGateTimer}

export type StartupGateEffect =
  | {readonly type: 'preload.read'}
  | {readonly type: 'list.fetch'}
  | {readonly type: 'timer.start'; readonly timer: StartupGateTimer}
  | {readonly type: 'timer.stop'}

export type StartupGateTransition = {
  readonly state: StartupGateState
  readonly effects: readonly StartupGateEffect[]
}

type PreferenceEvent = Extract<
  StartupGateEvent,
  {type: 'preload.resolved' | 'list.resolved' | 'list.failed' | 'installed.pushed'}
>

const loading: ListRequest = {status: 'loading'}

export function createStartupGateState(input: {
  readonly bridge: boolean
  readonly preload: boolean
  readonly plugins: readonly string[]
  readonly servers: boolean
}): StartupGateTransition {
  const state: Extract<StartupGateState, {status: 'preferences'}> = {
    status: 'preferences',
    pending: input.preload ? {kind: 'both'} : {kind: 'list'},
    plugins: Array.from(new Set(input.plugins)),
    inventory: input.servers ? 'loading' : 'none',
  }

  if (!input.bridge) return advance(state, {status: 'loaded', preload: [], list: []})

  return step(state, [
    ...(input.preload ? [{type: 'preload.read'} as const] : []),
    {type: 'list.fetch'},
    {type: 'timer.start', timer: 'preferences'},
  ])
}

export function transitionStartupGate(state: StartupGateState, event: StartupGateEvent): StartupGateTransition {
  if (state.status === 'preferences') return preferences(state, event)

  if (
    event.type === 'preload.resolved' ||
    event.type === 'list.resolved' ||
    event.type === 'list.failed' ||
    event.type === 'installed.pushed'
  ) {
    const next = updatePreferences(state.preferences, event)

    return step(next === state.preferences ? state : {...state, preferences: next})
  }

  if (state.status === 'activating') return activating(state, event)

  if (state.status === 'servers') return servers(state, event)

  return step(state)
}

export function selectHostReady(state: StartupGateState) {
  return state.status === 'servers' || state.status === 'ready'
}

export function selectServersReady(state: StartupGateState) {
  return state.status === 'ready'
}

export function selectInstalled(state: StartupGateState): readonly Installed[] {
  if (state.status === 'preferences' || state.preferences.status !== 'loaded') return []

  return state.preferences.list
}

export function selectMainFailed(state: StartupGateState, id: string) {
  if (state.status === 'preferences') return false

  if (state.preferences.status !== 'loaded') return state.preferences.list.status === 'failed'

  return state.preferences.list.some((item) => item.id === id && item.error !== undefined)
}

export function selectDisabled(state: StartupGateState, ids: readonly string[], builtins: ReadonlySet<string>) {
  if (state.status === 'preferences') return undefined

  const rows = enableRows(state.preferences)

  return new Set(
    ids.filter((id) => {
      const builtin = builtins.has(id)

      return !(rows ? pluginEnabled({id, builtin}, rows) : builtin)
    }),
  )
}

function preferences(
  state: Extract<StartupGateState, {status: 'preferences'}>,
  event: StartupGateEvent,
): StartupGateTransition {
  const pending = state.pending

  if (event.type === 'installed.pushed') return advance(state, {status: 'loaded', preload: [], list: event.list})

  if (event.type === 'preload.resolved') {
    if (pending.kind === 'list') return step(state)

    return advance(state, {
      status: 'preload',
      rows: event.rows,
      list: pending.kind === 'both' ? loading : {status: 'failed', error: pending.error},
    })
  }

  if (event.type === 'preload.unavailable') {
    if (pending.kind === 'both') return step({...state, pending: {kind: 'list'}})

    if (pending.kind === 'preload')
      return advance(state, {status: 'unknown', list: {status: 'failed', error: pending.error}})

    return step(state)
  }

  if (event.type === 'list.resolved') {
    if (pending.kind === 'preload') return step(state)

    return advance(state, {status: 'loaded', preload: [], list: event.list})
  }

  if (event.type === 'list.failed') {
    if (pending.kind === 'both') return step({...state, pending: {kind: 'preload', error: event.error}})

    if (pending.kind === 'list')
      return advance(state, {status: 'unknown', list: {status: 'failed', error: event.error}})

    return step(state)
  }

  if (event.type === 'timeout' && event.timer === 'preferences')
    return advance(state, {
      status: 'unknown',
      list: pending.kind === 'preload' ? {status: 'failed', error: pending.error} : loading,
    })

  if (event.type === 'inventory.settled' && state.inventory === 'loading') return step({...state, inventory: 'settled'})

  return step(state)
}

function activating(
  state: Extract<StartupGateState, {status: 'activating'}>,
  event: StartupGateEvent,
): StartupGateTransition {
  if (event.type === 'plugin.settled') {
    if (!state.pending.includes(event.id)) return step(state)

    const pending = state.pending.filter((id) => id !== event.id)

    if (pending.length > 0) return step({...state, pending})

    return activated(state.preferences, state.inventory)
  }

  if (event.type === 'timeout' && event.timer === 'activation') return activated(state.preferences, state.inventory)

  if (event.type === 'inventory.settled' && state.inventory === 'loading') return step({...state, inventory: 'settled'})

  return step(state)
}

function servers(state: Extract<StartupGateState, {status: 'servers'}>, event: StartupGateEvent) {
  if (event.type === 'timeout' && event.timer === 'servers') return ready(state.preferences)

  if (event.type === 'inventory.settled') {
    if (state.pending === 'both') return step({...state, pending: 'sources'})

    if (state.pending === 'inventory') return ready(state.preferences)
  }

  if (event.type === 'sources.settled') {
    if (state.pending === 'both') return step({...state, pending: 'inventory'})

    if (state.pending === 'sources') return ready(state.preferences)
  }

  return step(state)
}

function advance(state: Extract<StartupGateState, {status: 'preferences'}>, preferences: Preferences) {
  if (state.plugins.length === 0) return activated(preferences, state.inventory)

  return step({status: 'activating', pending: state.plugins, preferences, inventory: state.inventory}, [
    {type: 'timer.start', timer: 'activation'},
  ])
}

function activated(preferences: Preferences, inventory: Inventory) {
  if (inventory === 'none') return ready(preferences)

  return step({status: 'servers', pending: inventory === 'settled' ? 'sources' : 'both', preferences}, [
    {type: 'timer.start', timer: 'servers'},
  ])
}

function ready(preferences: Preferences) {
  return step({status: 'ready', preferences}, [{type: 'timer.stop'}])
}

function updatePreferences(preferences: Preferences, event: PreferenceEvent): Preferences {
  if (event.type === 'installed.pushed') return {status: 'loaded', preload: preloadRows(preferences), list: event.list}

  if (event.type === 'preload.resolved')
    return preferences.status === 'unknown'
      ? {status: 'preload', rows: event.rows, list: preferences.list}
      : preferences

  if (preferences.status === 'loaded' || preferences.list.status !== 'loading') return preferences

  if (event.type === 'list.resolved') return {status: 'loaded', preload: preloadRows(preferences), list: event.list}

  return {...preferences, list: {status: 'failed', error: event.error}}
}

function preloadRows(preferences: Preferences) {
  if (preferences.status === 'preload') return preferences.rows

  if (preferences.status === 'loaded') return preferences.preload

  return []
}

function enableRows(preferences: Preferences) {
  if (preferences.status === 'unknown') return undefined

  if (preferences.status === 'preload') return preferences.rows

  return [
    ...preferences.preload.filter((row) => !preferences.list.some((item) => item.id === row.id)),
    ...preferences.list,
  ]
}

function step(state: StartupGateState, effects: readonly StartupGateEffect[] = []): StartupGateTransition {
  return {state, effects}
}
