export const WATCH_RETRY_MS = 1_000

export const LIST_TIMEOUT_MS = 30_000

export type HostEndpoint = {
  readonly url: string
  readonly authorization: string | undefined
}

export type HostWatch =
  | {readonly status: 'idle'}
  | {readonly status: 'streaming'; readonly attempt: number}
  | {readonly status: 'retrying'; readonly attempt: number}

export type HostList =
  | {readonly status: 'idle'}
  | {readonly status: 'listing'; readonly attempt: number; readonly queued: boolean}

type HostShared = {
  readonly nextAttempt: number
}

export type HostState =
  | ({readonly status: 'stopped'} & HostShared)
  | ({
      readonly status: 'following'
      readonly endpoint: HostEndpoint | undefined
      readonly watch: HostWatch
      readonly list: HostList
    } & HostShared)

export type HostEvent<Listing> =
  | {readonly type: 'started'; readonly endpoint: HostEndpoint | undefined; readonly quitting: boolean}
  | {readonly type: 'resumed'; readonly endpoint: HostEndpoint | undefined; readonly quitting: boolean}
  | {readonly type: 'stopped'}
  | {readonly type: 'endpoint.changed'; readonly endpoint: HostEndpoint | undefined; readonly quitting: boolean}
  | {readonly type: 'watch.ended'; readonly attempt: number; readonly quitting: boolean}
  | {readonly type: 'watch.retry-due'; readonly attempt: number; readonly quitting: boolean}
  | {readonly type: 'relist.requested'; readonly watchAttempt: number; readonly quitting: boolean}
  | {readonly type: 'list.succeeded'; readonly attempt: number; readonly listing: Listing; readonly quitting: boolean}
  | {readonly type: 'list.failed'; readonly attempt: number; readonly cause: unknown; readonly quitting: boolean}
  | {readonly type: 'list.timed-out'; readonly attempt: number; readonly quitting: boolean}

export type HostCommand<Listing> =
  | {readonly type: 'subscribe-credentials'}
  | {readonly type: 'unsubscribe-credentials'}
  | {readonly type: 'start-watch'; readonly attempt: number; readonly endpoint: HostEndpoint}
  | {readonly type: 'schedule-watch-retry'; readonly attempt: number; readonly delayMs: number}
  | {readonly type: 'cancel-watch'}
  | {
      readonly type: 'start-list'
      readonly attempt: number
      readonly endpoint: HostEndpoint
      readonly timeoutMs: number
    }
  | {readonly type: 'cancel-list'}
  | {readonly type: 'apply-listing'; readonly listing: Listing}
  | {readonly type: 'log-list-error'; readonly cause: unknown}

export type HostTransition<Listing> = {
  readonly state: HostState
  readonly commands: readonly HostCommand<Listing>[]
}

type Following = Extract<HostState, {status: 'following'}>

export function createHostState(): HostState {
  return {status: 'stopped', nextAttempt: 1}
}

export function transitionHost<Listing>(state: HostState, event: HostEvent<Listing>): HostTransition<Listing> {
  switch (event.type) {
    case 'resumed':
      return transitionHost<Listing>(state, {...event, type: 'started'})

    case 'started':
      if (state.status === 'following') return follow(state, event.endpoint, event.quitting)

      if (event.quitting) return unchanged(state)

      return follow(
        {...state, status: 'following', endpoint: undefined, watch: IDLE_WATCH, list: IDLE_LIST},
        event.endpoint,
        false,
        [{type: 'subscribe-credentials'}],
      )

    case 'stopped':
      if (state.status === 'stopped') return unchanged(state)

      return {
        state: {
          status: 'stopped',
          nextAttempt: state.nextAttempt,
        },
        commands: [{type: 'unsubscribe-credentials'}, ...cancelled<Listing>(state)],
      }
  }

  if (state.status !== 'following') return unchanged(state)

  switch (event.type) {
    case 'endpoint.changed':
      return follow(state, event.endpoint, event.quitting)

    case 'watch.ended': {
      if (state.watch.status !== 'streaming' || state.watch.attempt !== event.attempt) return unchanged(state)

      if (event.quitting) return {state: {...state, watch: IDLE_WATCH}, commands: []}
      const attempt = state.nextAttempt

      return {
        state: {...state, nextAttempt: attempt + 1, watch: {status: 'retrying', attempt}},
        commands: [{type: 'schedule-watch-retry', attempt, delayMs: WATCH_RETRY_MS}],
      }
    }

    case 'watch.retry-due': {
      if (state.watch.status !== 'retrying' || state.watch.attempt !== event.attempt) return unchanged(state)

      if (event.quitting || !state.endpoint) return {state: {...state, watch: IDLE_WATCH}, commands: []}
      const attempt = state.nextAttempt

      return {
        state: {...state, nextAttempt: attempt + 1, watch: {status: 'streaming', attempt}},
        commands: [{type: 'start-watch', attempt, endpoint: state.endpoint}],
      }
    }

    case 'relist.requested': {
      if (event.quitting || !state.endpoint) return unchanged(state)

      if (state.watch.status !== 'streaming' || state.watch.attempt !== event.watchAttempt) return unchanged(state)

      if (state.list.status === 'listing')
        return state.list.queued
          ? unchanged(state)
          : {state: {...state, list: {...state.list, queued: true}}, commands: []}

      return list(state, state.endpoint, [])
    }

    case 'list.succeeded':
      if (!currentList(state, event.attempt)) return unchanged(state)

      if (event.quitting) return settleList(state, [], true)

      return settleList(state, [{type: 'apply-listing', listing: event.listing}], false)

    case 'list.failed':
      if (!currentList(state, event.attempt)) return unchanged(state)

      return settleList(state, [{type: 'log-list-error', cause: event.cause}], event.quitting)

    case 'list.timed-out':
      if (!currentList(state, event.attempt)) return unchanged(state)

      return settleList(
        state,
        [
          {type: 'cancel-list'},
          {type: 'log-list-error', cause: new Error(`Plugin listing timed out after ${LIST_TIMEOUT_MS} ms`)},
        ],
        event.quitting,
      )
  }
}

export function isCurrentHostWatch(state: HostState, attempt: number) {
  return state.status === 'following' && state.watch.status === 'streaming' && state.watch.attempt === attempt
}

export function sameHostEndpoint(first: HostEndpoint | undefined, second: HostEndpoint | undefined) {
  return first?.url === second?.url && first?.authorization === second?.authorization
}

const IDLE_WATCH: HostWatch = Object.freeze({status: 'idle'})

const IDLE_LIST: HostList = Object.freeze({status: 'idle'})

function currentList(state: Following, attempt: number) {
  return state.list.status === 'listing' && state.list.attempt === attempt
}

function follow<Listing>(
  state: Following,
  endpoint: HostEndpoint | undefined,
  quitting: boolean,
  before: readonly HostCommand<Listing>[] = [],
): HostTransition<Listing> {
  const same = sameHostEndpoint(state.endpoint, endpoint)

  if (quitting && same && state.watch.status === 'idle' && state.list.status === 'idle' && before.length === 0)
    return unchanged(state)
  const stopsList = quitting || !same

  const commands: HostCommand<Listing>[] = [
    ...before,
    ...(state.watch.status === 'idle' ? [] : [{type: 'cancel-watch' as const}]),
    ...(stopsList && state.list.status !== 'idle' ? [{type: 'cancel-list' as const}] : []),
  ]

  const listing = stopsList ? IDLE_LIST : state.list

  if (quitting || !endpoint) return {state: {...state, endpoint, watch: IDLE_WATCH, list: listing}, commands}
  const attempt = state.nextAttempt

  return {
    state: {...state, endpoint, nextAttempt: attempt + 1, watch: {status: 'streaming', attempt}, list: listing},
    commands: [...commands, {type: 'start-watch', attempt, endpoint}],
  }
}

function list<Listing>(
  state: Following,
  endpoint: HostEndpoint,
  before: readonly HostCommand<Listing>[],
): HostTransition<Listing> {
  const attempt = state.nextAttempt

  return {
    state: {...state, nextAttempt: attempt + 1, list: {status: 'listing', attempt, queued: false}},
    commands: [...before, {type: 'start-list', attempt, endpoint, timeoutMs: LIST_TIMEOUT_MS}],
  }
}

function settleList<Listing>(
  state: Following,
  commands: readonly HostCommand<Listing>[],
  quitting: boolean,
): HostTransition<Listing> {
  if (!quitting && state.list.status === 'listing' && state.list.queued && state.endpoint)
    return list(state, state.endpoint, commands)

  return {state: {...state, list: IDLE_LIST}, commands}
}

function cancelled<Listing>(state: Following): HostCommand<Listing>[] {
  return [
    ...(state.watch.status === 'idle' ? [] : [{type: 'cancel-watch' as const}]),
    ...(state.list.status === 'idle' ? [] : [{type: 'cancel-list' as const}]),
  ]
}

function unchanged<Listing>(state: HostState): HostTransition<Listing> {
  return {state, commands: []}
}
