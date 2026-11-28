import {Match} from 'effect'

export type TrustStatus = 'checking' | 'trusted' | 'untrusted' | 'revoked' | 'unreachable'

export type SocketPhase = 'closed' | 'waiting' | 'connecting' | 'open' | 'disposed'

export type EngineConnectionTimings = {
  readonly reconnectMinDelayMs: number
  readonly reconnectMaxDelayMs: number
  readonly reconnectDelayGrowth: number
  readonly openTimeoutMs: number
  readonly callDeadlineMs: number
  readonly connectionLossRetryDelayMs: number
  readonly authTimeoutMs: number
  readonly offlineGraceMs: number
  readonly idleTimeoutMs: number
}

export const defaultEngineConnectionTimings: EngineConnectionTimings = {
  reconnectMinDelayMs: 250,
  reconnectMaxDelayMs: 2000,
  reconnectDelayGrowth: 1.3,
  openTimeoutMs: 30_000,
  callDeadlineMs: 3000,
  connectionLossRetryDelayMs: 250,
  authTimeoutMs: 3000,
  offlineGraceMs: 1000,
  idleTimeoutMs: 45_000,
}

export type ConnectionState = {
  readonly socket: SocketPhase
  readonly attempt: number
  readonly retries: number
  readonly trust: TrustStatus
  readonly token: string | undefined
  readonly timings: EngineConnectionTimings
}

export type ConnectionSignal =
  | {readonly type: 'reachable'; readonly reachable: boolean}
  | {readonly type: 'status'; readonly status: TrustStatus; readonly previous: TrustStatus}

export type ConnectionEvent =
  | {readonly type: 'call-started'}
  | {readonly type: 'reset-requested'}
  | {readonly type: 'stalled'}
  | {readonly type: 'stream-ended'}
  | {readonly type: 'retry-due'; readonly attempt: number}
  | {readonly type: 'socket-opened'; readonly attempt: number}
  | {readonly type: 'socket-closed'; readonly attempt: number; readonly code: number}
  | {readonly type: 'uptime-reached'; readonly attempt: number}
  | {readonly type: 'trusted'; readonly token: string}
  | {readonly type: 'trust-refused'; readonly token: string}
  | {readonly type: 'trust-unanswered'}
  | {readonly type: 'unauthorized'; readonly token: string | undefined}
  | {readonly type: 'token-stored'}
  | {readonly type: 'disposed'}

export type ConnectionEffect =
  | {readonly type: 'schedule-retry'; readonly attempt: number; readonly delayMs: number}
  | {readonly type: 'open-socket'; readonly attempt: number}
  | {readonly type: 'close-socket'}
  | {readonly type: 'close-peer'}
  | {readonly type: 'send-trust-frame'; readonly token: string}
  | {readonly type: 'schedule-uptime'; readonly attempt: number}
  | {readonly type: 'publish'; readonly signal: ConnectionSignal}
  | {readonly type: 'ask-trust'}
  | {readonly type: 'check-stored-token'}
  | {readonly type: 'store-token'; readonly token: string}
  | {readonly type: 'forget-token'; readonly token: string}

export type ConnectionTransition = {readonly state: ConnectionState; readonly effects: readonly ConnectionEffect[]}

export const REVOKED_SOCKET_CLOSE_CODE = 1008

export function reconnectDelay(retries: number, timings: EngineConnectionTimings): number {
  if (retries <= 0) return 0
  return Math.min(
    timings.reconnectMaxDelayMs,
    timings.reconnectMinDelayMs * timings.reconnectDelayGrowth ** (retries - 1),
  )
}

export function createConnectionState(
  token: string | undefined,
  timings: EngineConnectionTimings = defaultEngineConnectionTimings,
): ConnectionState {
  return {socket: 'closed', attempt: 0, retries: -1, trust: 'checking', token, timings}
}

function unchanged(state: ConnectionState): ConnectionTransition {
  return {state, effects: []}
}

function withTrust(state: ConnectionState, trust: TrustStatus): ConnectionTransition {
  if (state.trust === trust) return unchanged(state)
  return {
    state: {...state, trust},
    effects: [{type: 'publish', signal: {type: 'status', status: trust, previous: state.trust}}],
  }
}

function refusedStatus(token: string | undefined): TrustStatus {
  return token === undefined || token === '' ? 'untrusted' : 'revoked'
}

function connect(state: ConnectionState): ConnectionTransition {
  const retries = state.retries + 1
  const attempt = state.attempt + 1
  return {
    state: {...state, socket: 'waiting', attempt, retries},
    effects: [{type: 'schedule-retry', attempt, delayMs: reconnectDelay(retries, state.timings)}],
  }
}

function reconnect(state: ConnectionState): ConnectionTransition {
  return connect({...state, retries: -1})
}

function dropAndReconnect(state: ConnectionState): ConnectionTransition {
  const next = reconnect(state)
  return {
    state: next.state,
    effects: [
      {type: 'close-socket'},
      ...next.effects,
      {type: 'publish', signal: {type: 'reachable', reachable: false}},
      {type: 'close-peer'},
    ],
  }
}

function endAndReconnect(state: ConnectionState): ConnectionTransition {
  const next = connect(state)
  return {
    state: next.state,
    effects: [
      {type: 'close-socket'},
      ...next.effects,
      {type: 'publish', signal: {type: 'reachable', reachable: false}},
      {type: 'close-peer'},
    ],
  }
}

function distrust(state: ConnectionState, refused: string | undefined): ConnectionTransition {
  if (state.trust === 'checking' || refused !== state.token) return unchanged(state)
  if (refused === undefined && state.trust === 'revoked') return unchanged(state)
  const next = withTrust({...state, token: undefined}, refusedStatus(refused))
  const forget: ConnectionEffect[] = state.token === undefined ? [] : [{type: 'forget-token', token: state.token}]
  return {state: next.state, effects: [...forget, ...next.effects]}
}

function refuse(state: ConnectionState, token: string): ConnectionTransition {
  if (state.trust === 'trusted' && state.token !== token) return unchanged(state)
  const next = withTrust({...state, token: state.token === token ? undefined : state.token}, refusedStatus(token))
  return {state: next.state, effects: [{type: 'forget-token', token}, ...next.effects]}
}

function trustWith(state: ConnectionState, token: string): ConnectionTransition {
  const next = withTrust({...state, token}, 'trusted')
  return {state: next.state, effects: [{type: 'store-token', token}, ...next.effects]}
}

function open(state: ConnectionState): ConnectionTransition {
  const ask: ConnectionEffect[] = state.trust === 'unreachable' ? [{type: 'ask-trust'}] : []
  return {
    state: {...state, socket: 'open'},
    effects: [
      {type: 'send-trust-frame', token: state.token ?? ''},
      {type: 'schedule-uptime', attempt: state.attempt},
      {type: 'publish', signal: {type: 'reachable', reachable: true}},
      ...ask,
    ],
  }
}

function close(state: ConnectionState, code: number): ConnectionTransition {
  if (code === REVOKED_SOCKET_CLOSE_CODE) {
    const revoked = distrust({...state, socket: 'closed'}, state.token)
    return {state: revoked.state, effects: [...revoked.effects, {type: 'close-peer'}]}
  }
  const next = connect(state)
  return {
    state: next.state,
    effects: [...next.effects, {type: 'publish', signal: {type: 'reachable', reachable: false}}, {type: 'close-peer'}],
  }
}

function resetSocket(state: ConnectionState): ConnectionTransition {
  if (state.socket === 'waiting') return reconnect(state)
  if (state.socket === 'connecting') return dropAndReconnect(state)
  return unchanged(state)
}

function current(state: ConnectionState, attempt: number, ...phases: SocketPhase[]): boolean {
  return state.attempt === attempt && phases.includes(state.socket)
}

function retryDue(state: ConnectionState, attempt: number): ConnectionTransition {
  if (!current(state, attempt, 'waiting')) return unchanged(state)
  return {state: {...state, socket: 'connecting'}, effects: [{type: 'open-socket', attempt}]}
}

function dispose(state: ConnectionState): ConnectionTransition {
  return {state: {...state, socket: 'disposed'}, effects: [{type: 'close-socket'}, {type: 'close-peer'}]}
}

export function transitionConnection(state: ConnectionState, event: ConnectionEvent): ConnectionTransition {
  if (state.socket === 'disposed') return unchanged(state)
  return Match.value(event).pipe(
    Match.discriminatorsExhaustive('type')({
      'call-started': () => (state.socket === 'closed' ? reconnect(state) : unchanged(state)),
      'reset-requested': () => resetSocket(state),
      stalled: () => (state.socket === 'open' ? dropAndReconnect(state) : unchanged(state)),
      'stream-ended': () => (state.socket === 'open' ? endAndReconnect(state) : unchanged(state)),
      'retry-due': (due) => retryDue(state, due.attempt),
      'socket-opened': (opened) => (current(state, opened.attempt, 'connecting') ? open(state) : unchanged(state)),
      'socket-closed': (closed) =>
        current(state, closed.attempt, 'connecting', 'open') ? close(state, closed.code) : unchanged(state),
      'uptime-reached': (reached) =>
        unchanged(current(state, reached.attempt, 'open') ? {...state, retries: 0} : state),
      trusted: (trusted) => trustWith(state, trusted.token),
      'trust-refused': (refused) => refuse(state, refused.token),
      unauthorized: (unauthorized) => distrust(state, unauthorized.token),
      'trust-unanswered': () => (state.trust === 'checking' ? withTrust(state, 'unreachable') : unchanged(state)),
      'token-stored': () =>
        state.trust === 'trusted' ? unchanged(state) : {state, effects: [{type: 'check-stored-token'}]},
      disposed: () => dispose(state),
    }),
  )
}
