export type FeedChange = {
  readonly table: string
  readonly key: string
  readonly type: 'upsert' | 'delete'
  readonly cursor: number
}

export type ChangeFeedState =
  | {readonly status: 'opening'; readonly attempt: number; readonly cursor: number}
  | {readonly status: 'catchingUp'; readonly attempt: number; readonly cursor: number}
  | {readonly status: 'live'; readonly attempt: number; readonly cursor: number}
  | {readonly status: 'reloading'; readonly attempt: number; readonly cursor: number}
  | {readonly status: 'disposed'}

export type ChangeFeedEvent =
  | {readonly type: 'positionRead'; readonly attempt: number; readonly cursor: number}
  | {readonly type: 'sinceRead'; readonly attempt: number; readonly changes: readonly FeedChange[]}
  | {readonly type: 'connected'}
  | {readonly type: 'changed'; readonly change: FeedChange}
  | {readonly type: 'streamStopped'}
  | {readonly type: 'disposed'}

export type ChangeFeedEffect =
  | {readonly type: 'readPosition'; readonly attempt: number}
  | {readonly type: 'readSince'; readonly attempt: number; readonly cursor: number}
  | {readonly type: 'route'; readonly changes: readonly FeedChange[]}
  | {readonly type: 'opened'}
  | {readonly type: 'reload'}
  | {readonly type: 'subscribe'}

export type ChangeFeedTransition = {readonly state: ChangeFeedState; readonly effects: readonly ChangeFeedEffect[]}

type OpenFeed = Exclude<ChangeFeedState, {readonly status: 'disposed'}>

export function startChangeFeed(): ChangeFeedTransition {
  return {
    state: {status: 'opening', attempt: 0, cursor: 0},
    effects: [{type: 'readPosition', attempt: 0}, {type: 'subscribe'}],
  }
}

function catchUp(state: OpenFeed, cursor: number, before: readonly ChangeFeedEffect[]): ChangeFeedTransition {
  const attempt = state.attempt + 1
  return {
    state: {status: 'catchingUp', attempt, cursor},
    effects: [...before, {type: 'readSince', attempt, cursor}],
  }
}

function routeChanges(state: OpenFeed, changes: readonly FeedChange[]): ChangeFeedTransition {
  const fresh = changes.filter((change) => change.cursor > state.cursor)
  const cursor = fresh.at(-1)?.cursor ?? state.cursor
  const routed: readonly ChangeFeedEffect[] = fresh.length ? [{type: 'route', changes: fresh}] : []
  return {state: {...state, cursor}, effects: routed}
}

function readPosition(state: OpenFeed, cursor: number): ChangeFeedTransition {
  const known = Math.max(state.cursor, cursor)
  if (state.status === 'opening') return catchUp(state, known, [{type: 'opened'}])
  return {
    state: {status: 'live', attempt: state.attempt, cursor: known},
    effects: [{type: 'reload'}, {type: 'subscribe'}],
  }
}

function transitionOpen(
  state: OpenFeed,
  event: Exclude<ChangeFeedEvent, {readonly type: 'disposed'}>,
): ChangeFeedTransition {
  const unchanged = {state, effects: []}
  if (event.type === 'changed') return routeChanges(state, [event.change])
  if (event.type === 'streamStopped') {
    const attempt = state.attempt + 1
    return {
      state: {status: 'reloading', attempt, cursor: state.cursor},
      effects: [{type: 'readPosition', attempt}],
    }
  }
  if (event.type === 'connected') {
    if (state.status === 'live' || state.status === 'catchingUp') return catchUp(state, state.cursor, [])
    return unchanged
  }
  if (event.attempt !== state.attempt) return unchanged
  if (event.type === 'positionRead') {
    if (state.status === 'opening' || state.status === 'reloading') return readPosition(state, event.cursor)
    return unchanged
  }
  if (state.status !== 'catchingUp') return unchanged
  return routeChanges({status: 'live', attempt: state.attempt, cursor: state.cursor}, event.changes)
}

export function transitionChangeFeed(state: ChangeFeedState, event: ChangeFeedEvent): ChangeFeedTransition {
  if (state.status === 'disposed') return {state, effects: []}
  if (event.type === 'disposed') return {state: {status: 'disposed'}, effects: []}
  return transitionOpen(state, event)
}
