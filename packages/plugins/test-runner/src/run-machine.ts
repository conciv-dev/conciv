import type {ChildMessage} from './child-protocol.js'
import type {Summary, TestEvent, TestRunResult} from './events.js'
import type {ListFile} from './runner.js'

type ChildExit =
  | {readonly type: 'exited'; readonly code: number | null; readonly signal: string | null}
  | {readonly type: 'failed'; readonly reason: string}
  | {readonly type: 'stopped'}

type Phase =
  | {readonly status: 'idle'}
  | {
      readonly status: 'listing'
      readonly attempt: number
      readonly files: readonly ListFile[] | null
      readonly error: string | null
    }
  | {
      readonly status: 'running'
      readonly attempt: number
      readonly buffer: readonly TestEvent[]
      readonly error: string | null
    }
  | {readonly status: 'stopping'; readonly attempt: number}
  | {readonly status: 'disposed'}

type Cache = {
  readonly runner: string
  readonly nextAttempt: number
  readonly last: TestRunResult
  readonly unavailable: string | null
}

type RunState = Phase & Cache

export type Settlement =
  | {readonly ok: true; readonly result: TestRunResult; readonly files: readonly ListFile[]}
  | {readonly ok: false; readonly message: string}

export type RunEvent =
  | {readonly type: 'run-requested'; readonly attempt: number; readonly args: readonly string[]}
  | {readonly type: 'list-requested'; readonly attempt: number; readonly args: readonly string[]}
  | {readonly type: 'child-event'; readonly attempt: number; readonly message: ChildMessage}
  | {readonly type: 'child-exited'; readonly attempt: number; readonly exit: ChildExit}
  | {readonly type: 'stop-requested'}
  | {readonly type: 'disposed'}

export type RunEffect =
  | {readonly type: 'spawn'; readonly attempt: number; readonly args: readonly string[]}
  | {readonly type: 'kill'; readonly attempt: number}
  | {readonly type: 'publish'; readonly event: TestEvent}
  | {readonly type: 'settle'; readonly attempt: number; readonly settlement: Settlement}

type RunTransition = {readonly state: RunState; readonly effects: readonly RunEffect[]}

type Busy = Extract<RunState, {readonly status: 'listing' | 'running' | 'stopping'}>

const EMPTY_SUMMARY: Summary = {passed: 0, failed: 0, skipped: 0, durationMs: 0}

export function createRunState(runner: string): RunState {
  return {
    status: 'idle',
    runner,
    nextAttempt: 1,
    last: {summary: EMPTY_SUMMARY, failures: [], tests: []},
    unavailable: null,
  }
}

export function transitionRun(state: RunState, event: RunEvent): RunTransition {
  if (event.type === 'disposed') return dispose(state)
  if (event.type === 'run-requested' || event.type === 'list-requested') return request(state, event)
  if (event.type === 'stop-requested') return stop(state)
  if (event.type === 'child-event') return receive(state, event)
  return settleExit(state, event)
}

export function selectCurrentRun(state: RunState): {events: TestEvent[] | null; unavailable: string | null} {
  const events = state.status === 'running' && state.buffer.length > 0 ? [...state.buffer] : null
  return {events, unavailable: state.unavailable}
}

export function selectReplay(state: RunState): readonly TestEvent[] {
  return state.status === 'running' ? state.buffer : []
}

function cache(state: RunState): Cache {
  return {runner: state.runner, nextAttempt: state.nextAttempt, last: state.last, unavailable: state.unavailable}
}

function unavailable(state: RunState, reason: string): string {
  return `${state.runner} unavailable: ${reason}`
}

function settle(attempt: number, settlement: Settlement): RunEffect {
  return {type: 'settle', attempt, settlement}
}

function succeeded(state: RunState, files: readonly ListFile[]): Settlement {
  return {ok: true, result: state.last, files}
}

function request(
  state: RunState,
  event: Extract<RunEvent, {readonly type: 'run-requested' | 'list-requested'}>,
): RunTransition {
  if (event.attempt !== state.nextAttempt) return {state, effects: []}
  const next = {...cache(state), nextAttempt: state.nextAttempt + 1}

  if (state.status === 'disposed')
    return {
      state: {...next, status: 'disposed'},
      effects: [settle(event.attempt, {ok: false, message: unavailable(state, 'the test runner stopped')})],
    }

  if (state.status !== 'idle')
    return {
      state: {...state, nextAttempt: next.nextAttempt},
      effects: [settle(event.attempt, {ok: false, message: unavailable(state, 'a test run is already in progress')})],
    }
  const spawn: RunEffect = {type: 'spawn', attempt: event.attempt, args: event.args}

  if (event.type === 'list-requested')
    return {state: {...next, status: 'listing', attempt: event.attempt, files: null, error: null}, effects: [spawn]}

  return {state: {...next, status: 'running', attempt: event.attempt, buffer: [], error: null}, effects: [spawn]}
}

function receive(state: RunState, event: Extract<RunEvent, {readonly type: 'child-event'}>): RunTransition {
  if ((state.status !== 'running' && state.status !== 'listing') || state.attempt !== event.attempt)
    return {state, effects: []}
  const message = event.message

  if (message.type === 'error') return {state: {...state, error: message.reason}, effects: []}

  if (state.status === 'listing')
    return message.type === 'list' ? {state: {...state, files: message.files}, effects: []} : {state, effects: []}

  return record(state, message)
}

function record(state: Extract<RunState, {readonly status: 'running'}>, message: ChildMessage): RunTransition {
  if (message.type === 'list' || message.type === 'error' || message.type === 'run-unavailable')
    return {state, effects: []}

  if (message.type === 'run-start')
    return {state: {...state, buffer: [message], unavailable: null}, effects: [{type: 'publish', event: message}]}
  const last =
    message.type === 'run-end'
      ? {summary: message.summary, failures: message.failures, tests: message.tests}
      : state.last

  return {state: {...state, last, buffer: [...state.buffer, message]}, effects: [{type: 'publish', event: message}]}
}

function exitReason(state: Extract<RunState, {readonly status: 'running' | 'listing'}>, exit: ChildExit) {
  if (state.error !== null) return state.error
  if (exit.type === 'failed') return exit.reason
  if (exit.type === 'stopped') return null
  const silent = state.status === 'running' ? state.buffer.length === 0 : state.files === null

  if (silent && (exit.code !== 0 || exit.signal !== null))
    return `child exited without producing results (exit code ${exit.code}, signal ${exit.signal})`

  return null
}

function settleExit(state: RunState, event: Extract<RunEvent, {readonly type: 'child-exited'}>): RunTransition {
  if (state.status === 'idle' || state.status === 'disposed' || state.attempt !== event.attempt)
    return {state, effects: []}
  const idle: RunState = {...cache(state), status: 'idle'}

  if (state.status === 'stopping') return {state: idle, effects: [settle(state.attempt, succeeded(state, []))]}
  const reason = exitReason(state, event.exit)

  if (reason === null)
    return {
      state: idle,
      effects: [settle(state.attempt, succeeded(state, state.status === 'listing' ? (state.files ?? []) : []))],
    }
  const message = unavailable(state, reason)

  if (state.status === 'listing') return {state: idle, effects: [settle(state.attempt, {ok: false, message})]}

  return {
    state: {...idle, unavailable: message},
    effects: [
      {type: 'publish', event: {type: 'run-unavailable', reason: message}},
      settle(state.attempt, {ok: false, message}),
    ],
  }
}

function stop(state: RunState): RunTransition {
  if (state.status !== 'running' && state.status !== 'listing') return {state, effects: []}

  return {
    state: {...cache(state), status: 'stopping', attempt: state.attempt},
    effects: [{type: 'kill', attempt: state.attempt}],
  }
}

function isBusy(state: RunState): state is Busy {
  return state.status === 'listing' || state.status === 'running' || state.status === 'stopping'
}

function dispose(state: RunState): RunTransition {
  if (state.status === 'disposed') return {state, effects: []}
  const disposed: RunState = {...cache(state), status: 'disposed'}

  if (!isBusy(state)) return {state: disposed, effects: []}

  return {
    state: disposed,
    effects: [
      {type: 'kill', attempt: state.attempt},
      settle(state.attempt, {ok: false, message: unavailable(state, 'the test runner stopped')}),
    ],
  }
}
