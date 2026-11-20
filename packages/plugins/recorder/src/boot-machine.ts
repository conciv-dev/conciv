export * as RecorderBootMachine from './boot-machine.js'
export type BootState =
  | {readonly status: 'off'; readonly attempt: number; readonly live: boolean}
  | {readonly status: 'starting'; readonly attempt: number; readonly live: boolean}
  | {readonly status: 'capturing'; readonly attempt: number; readonly live: boolean}
  | {readonly status: 'failed'; readonly attempt: number; readonly live: boolean}
  | {readonly status: 'disposed'; readonly attempt: number; readonly live: boolean}

export type BootEvent<Prepared> =
  | {readonly type: 'live.read'; readonly live: boolean}
  | {readonly type: 'selector.set'; readonly selector: string}
  | {readonly type: 'selector.cleared'}
  | {readonly type: 'prepared'; readonly attempt: number; readonly prepared: Prepared}
  | {readonly type: 'start.failed'; readonly attempt: number; readonly error: unknown}
  | {readonly type: 'session.failed'; readonly attempt: number}
  | {readonly type: 'disposed'}

export type BootEffect<Prepared> =
  | {readonly type: 'prepare'; readonly attempt: number; readonly selector: string}
  | {readonly type: 'open-session'; readonly attempt: number; readonly prepared: Prepared}
  | {readonly type: 'finish-session'}
  | {readonly type: 'report-start-failed'; readonly error: unknown}

type BootTransition<Prepared> = {readonly state: BootState; readonly effects: readonly BootEffect<Prepared>[]}

export const initialBoot: BootState = {status: 'off', attempt: 0, live: false}

type BootResult<Prepared> = Extract<
  BootEvent<Prepared>,
  {readonly type: 'prepared' | 'start.failed' | 'session.failed'}
>

function settleStart<Prepared>(state: BootState, event: BootResult<Prepared>): BootTransition<Prepared> {
  if (event.attempt !== state.attempt) return {state, effects: []}
  const failed: BootState = {status: 'failed', attempt: state.attempt, live: state.live}
  if (event.type === 'prepared' && state.status === 'starting')
    return {
      state: {status: 'capturing', attempt: state.attempt, live: state.live},
      effects: [{type: 'open-session', attempt: state.attempt, prepared: event.prepared}],
    }
  if (event.type === 'start.failed' && state.status === 'starting')
    return {state: failed, effects: [{type: 'report-start-failed', error: event.error}]}
  if (event.type === 'session.failed' && state.status === 'capturing') return {state: failed, effects: []}
  return {state, effects: []}
}

export function transitionBoot<Prepared>(state: BootState, event: BootEvent<Prepared>): BootTransition<Prepared> {
  if (state.status === 'disposed') return {state, effects: []}
  const attempt = state.attempt + 1
  if (event.type === 'live.read')
    return {state: event.live === state.live ? state : {...state, live: event.live}, effects: []}
  if (event.type === 'disposed')
    return {state: {status: 'disposed', attempt, live: state.live}, effects: [{type: 'finish-session'}]}
  if (event.type === 'selector.set')
    return {
      state: {status: 'starting', attempt, live: state.live},
      effects: [{type: 'finish-session'}, {type: 'prepare', attempt, selector: event.selector}],
    }
  if (event.type === 'selector.cleared')
    return {
      state: {status: state.status === 'failed' ? 'failed' : 'off', attempt, live: state.live},
      effects: [{type: 'finish-session'}],
    }
  return settleStart(state, event)
}
