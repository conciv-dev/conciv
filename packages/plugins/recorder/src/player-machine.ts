import type {RrwebEvent} from './rpc.js'

export * as RecorderPlayerMachine from './player-machine.js'

export const LIVE_EDGE_MS = 2500

export type Playback = {readonly playing: boolean; readonly currentTime: number}

export type PlayerState = {
  readonly status: 'waiting' | 'mounted' | 'disposed'
  readonly cursor: number
  readonly firstTs: number | undefined
  readonly lastTs: number
  readonly live: boolean
}

type PlayerEvent =
  | {readonly type: 'connected'}
  | {
      readonly type: 'arrived'
      readonly events: readonly RrwebEvent[]
      readonly cursor: number
      readonly playback: Playback
    }
  | {readonly type: 'observed'; readonly playback: Playback}
  | {readonly type: 'go-live'}
  | {readonly type: 'disposed'}

export type PlayerEffect =
  | {readonly type: 'build'}
  | {readonly type: 'seek'; readonly offset: number}
  | {readonly type: 'append'; readonly events: readonly RrwebEvent[]; readonly to: 'buffer' | 'edge' | 'player'}
  | {readonly type: 'announce'; readonly live: boolean}
  | {readonly type: 'destroy'}

type PlayerTransition = {readonly state: PlayerState; readonly effects: readonly PlayerEffect[]}

export function initialPlayer(events: readonly RrwebEvent[], cursor: number): PlayerState {
  return {status: 'waiting', cursor, firstTs: events[0]?.timestamp, lastTs: events.at(-1)?.timestamp ?? 0, live: true}
}

function tailOffset(state: PlayerState): number {
  return state.lastTs - (state.firstTs ?? 0)
}

export function selectLive(state: PlayerState, playback: Playback): boolean {
  if (state.status !== 'mounted') return true
  return playback.playing && playback.currentTime + LIVE_EDGE_MS >= tailOffset(state)
}

function announce(state: PlayerState, live: boolean): PlayerTransition {
  return {state: {...state, live}, effects: [{type: 'announce', live}]}
}

function arrive(state: PlayerState, event: Extract<PlayerEvent, {type: 'arrived'}>): PlayerTransition {
  const atEdge = selectLive(state, event.playback)
  const lastTs = event.events.reduce((latest, item) => Math.max(latest, item.timestamp), state.lastTs)
  const next: PlayerState = {
    ...state,
    cursor: Math.max(state.cursor, event.cursor),
    firstTs: state.firstTs ?? event.events[0]?.timestamp,
    lastTs,
  }
  const to = state.status !== 'mounted' ? 'buffer' : atEdge ? 'edge' : 'player'
  const live = selectLive(next, event.playback)
  return {
    state: {...next, live},
    effects: [
      {type: 'append', events: event.events, to},
      {type: 'announce', live},
    ],
  }
}

export function transitionPlayer(state: PlayerState, event: PlayerEvent): PlayerTransition {
  if (state.status === 'disposed') return {state, effects: []}
  if (event.type === 'disposed') return {state: {...state, status: 'disposed'}, effects: [{type: 'destroy'}]}
  if (event.type === 'arrived') return arrive(state, event)
  if (event.type === 'connected') {
    if (state.status !== 'waiting') return {state, effects: []}
    const mounted: PlayerState = {...state, status: 'mounted', live: true}
    return {
      state: mounted,
      effects: [{type: 'build'}, {type: 'seek', offset: tailOffset(mounted) + 1}, {type: 'announce', live: true}],
    }
  }
  if (state.status !== 'mounted') return {state, effects: []}
  if (event.type === 'go-live') {
    return {
      state: {...state, live: true},
      effects: [
        {type: 'seek', offset: tailOffset(state) + 1},
        {type: 'announce', live: true},
      ],
    }
  }
  return announce(state, selectLive(state, event.playback))
}
