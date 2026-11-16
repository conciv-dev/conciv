import {countStates, type Summary, type TestEvent, type TestRow, type TestRunResult} from '../shared/events.js'

export type RunPhase = 'idle' | 'running' | 'done' | 'unavailable'

export type RunState = {
  readonly phase: RunPhase
  readonly tests: readonly TestRow[]
  readonly summary: Summary
  readonly reason: string
}

export type RunAction =
  | TestEvent
  | {readonly type: 'connected'}
  | {readonly type: 'status'; readonly result: TestRunResult}

const EMPTY_SUMMARY: Summary = {passed: 0, failed: 0, skipped: 0, durationMs: 0}

export const initialRunState: RunState = {phase: 'idle', tests: [], summary: EMPTY_SUMMARY, reason: ''}

function settled(result: TestRunResult): RunState {
  return {phase: result.tests.length > 0 ? 'done' : 'idle', tests: result.tests, summary: result.summary, reason: ''}
}

function running(tests: readonly TestRow[]): RunState {
  const durationMs = tests.reduce((total, test) => total + test.durationMs, 0)
  return {phase: 'running', tests, summary: {...countStates(tests), durationMs}, reason: ''}
}

function upsert(tests: readonly TestRow[], row: TestRow): TestRow[] {
  const index = tests.findIndex((test) => test.id === row.id)
  return index < 0 ? [...tests, row] : tests.with(index, row)
}

function withTest(state: RunState, event: Extract<TestEvent, {type: 'test'}>): RunState {
  const row: TestRow = {
    id: event.id,
    file: event.file,
    name: event.name,
    state: event.state,
    durationMs: event.durationMs,
    error: event.error,
  }
  return running(state.phase === 'running' ? upsert(state.tests, row) : [row])
}

function afterConnected(state: RunState): RunState {
  return state.phase === 'running' ? initialRunState : state
}

function afterStatus(state: RunState, result: TestRunResult): RunState {
  return state.phase === 'running' ? state : settled(result)
}

export function transitionRun(state: RunState, action: RunAction): RunState {
  if (action.type === 'connected') return afterConnected(state)
  if (action.type === 'status') return afterStatus(state, action.result)
  if (action.type === 'run-start') return running([])
  if (action.type === 'test') return withTest(state, action)
  if (action.type === 'run-end') return settled(action)
  return state
}
