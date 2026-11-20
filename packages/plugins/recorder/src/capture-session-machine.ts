export * as RecorderCaptureSessionMachine from './capture-session-machine.js'
import type {RecorderConfig} from './rpc.js'

export type CaptureSessionState =
  | {readonly status: 'capturing'; readonly attempt: number}
  | {readonly status: 'paused'; readonly attempt: number}
  | {readonly status: 'resuming'; readonly attempt: number}
  | {readonly status: 'failed'; readonly attempt: number}
  | {readonly status: 'disposed'; readonly attempt: number}

type CaptureSessionEvent =
  | {readonly type: 'paused'}
  | {readonly type: 'resumed'}
  | {readonly type: 'config.read'; readonly attempt: number; readonly config: RecorderConfig}
  | {readonly type: 'config.failed'; readonly attempt: number; readonly error: unknown}
  | {readonly type: 'disposed'}

export type CaptureSessionEffect =
  | {readonly type: 'stop-record'}
  | {readonly type: 'start-record'; readonly config: RecorderConfig}
  | {readonly type: 'read-config'; readonly attempt: number}
  | {readonly type: 'flush'}
  | {readonly type: 'report-failed'; readonly error: unknown}
  | {readonly type: 'detach'}

type CaptureSessionTransition = {
  readonly state: CaptureSessionState
  readonly effects: readonly CaptureSessionEffect[]
}

export const initialCaptureSession: CaptureSessionState = {status: 'capturing', attempt: 0}

function pause(state: CaptureSessionState): CaptureSessionTransition {
  if (state.status === 'paused') return {state, effects: []}
  const stop: readonly CaptureSessionEffect[] = state.status === 'capturing' ? [{type: 'stop-record'}] : []
  return {state: {status: 'paused', attempt: state.attempt + 1}, effects: [...stop, {type: 'flush'}]}
}

function resume(state: CaptureSessionState): CaptureSessionTransition {
  if (state.status !== 'paused' && state.status !== 'failed') return {state, effects: []}
  const attempt = state.attempt + 1
  return {state: {status: 'resuming', attempt}, effects: [{type: 'read-config', attempt}]}
}

function settleConfig(
  state: CaptureSessionState,
  event: Extract<CaptureSessionEvent, {readonly type: 'config.read' | 'config.failed'}>,
): CaptureSessionTransition {
  if (state.status !== 'resuming' || event.attempt !== state.attempt) return {state, effects: []}
  if (event.type === 'config.read')
    return {
      state: {status: 'capturing', attempt: state.attempt},
      effects: [{type: 'start-record', config: event.config}],
    }
  return {state: {status: 'failed', attempt: state.attempt}, effects: [{type: 'report-failed', error: event.error}]}
}

export function transitionCaptureSession(
  state: CaptureSessionState,
  event: CaptureSessionEvent,
): CaptureSessionTransition {
  if (state.status === 'disposed') return {state, effects: []}
  if (event.type === 'disposed')
    return {
      state: {status: 'disposed', attempt: state.attempt + 1},
      effects: state.status === 'capturing' ? [{type: 'stop-record'}, {type: 'detach'}] : [{type: 'detach'}],
    }
  if (event.type === 'paused') return pause(state)
  if (event.type === 'resumed') return resume(state)
  return settleConfig(state, event)
}
