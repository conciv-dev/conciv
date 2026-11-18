import type {CurrentRun} from './runner.js'
import type {TestEvent, TestRunResult} from './events.js'
import type {RunViewAction} from './run-state.js'

export type FollowState =
  | {readonly status: 'subscribed'; readonly nextAttempt: number}
  | {readonly status: 'reading'; readonly attempt: number; readonly nextAttempt: number}
  | {readonly status: 'connected'; readonly attempt: number; readonly nextAttempt: number}
  | {readonly status: 'disposed'}

export type FollowEvent =
  | {readonly type: 'server-connected'}
  | {
      readonly type: 'read-done'
      readonly attempt: number
      readonly status: TestRunResult
      readonly current: CurrentRun
    }
  | {readonly type: 'read-failed'; readonly attempt: number; readonly error: unknown}
  | {readonly type: 'event'; readonly event: TestEvent}
  | {readonly type: 'event-invalid'; readonly error: unknown}
  | {readonly type: 'stream-failed'; readonly error: unknown}
  | {readonly type: 'disposed'}

export type FollowEffect =
  | {readonly type: 'read'; readonly attempt: number}
  | {readonly type: 'apply'; readonly action: RunViewAction}
  | {readonly type: 'log'; readonly message: string; readonly error: unknown}

export type FollowTransition = {readonly state: FollowState; readonly effects: readonly FollowEffect[]}

export function createFollowState(): FollowState {
  return {status: 'subscribed', nextAttempt: 1}
}

export function transitionFollow(state: FollowState, event: FollowEvent): FollowTransition {
  if (state.status === 'disposed') return {state, effects: []}

  if (event.type === 'disposed') return {state: {status: 'disposed'}, effects: []}

  if (event.type === 'event') return {state, effects: [{type: 'apply', action: event.event}]}

  if (event.type === 'event-invalid')
    return {
      state,
      effects: [{type: 'log', message: '[test-runner] a live test event did not match its schema', error: event.error}],
    }

  if (event.type === 'stream-failed')
    return {state, effects: [{type: 'log', message: '[test-runner] the live test events stopped', error: event.error}]}

  if (event.type === 'server-connected') {
    const attempt = state.nextAttempt
    return {
      state: {status: 'reading', attempt, nextAttempt: attempt + 1},
      effects: [
        {type: 'apply', action: {type: 'connected'}},
        {type: 'read', attempt},
      ],
    }
  }

  if (state.status !== 'reading' || state.attempt !== event.attempt) return {state, effects: []}
  const connected: FollowState = {status: 'connected', attempt: state.attempt, nextAttempt: state.nextAttempt}

  if (event.type === 'read-failed')
    return {
      state: connected,
      effects: [{type: 'log', message: '[test-runner] the test run could not be read', error: event.error}],
    }

  return {
    state: connected,
    effects: [
      {type: 'apply', action: {type: 'status', result: event.status}},
      {type: 'apply', action: {type: 'current', ...event.current}},
    ],
  }
}
