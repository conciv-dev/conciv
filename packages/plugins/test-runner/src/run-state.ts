import {countStates, type Summary, type TestEvent, type TestRow, type TestRunResult} from './events.js'

export type RunPhase = 'idle' | 'running' | 'done' | 'unavailable'

export type RunState = {
  readonly phase: RunPhase
  readonly tests: readonly TestRow[]
  readonly summary: Summary
  readonly reason: string
  readonly endedFiles: readonly string[]
}

type LoadAction =
  | {readonly type: 'connected'}
  | {readonly type: 'status'; readonly result: TestRunResult}
  | {readonly type: 'current'; readonly events: readonly TestEvent[] | null; readonly unavailable: string | null}

export type RunAction = TestEvent | LoadAction

const EMPTY_SUMMARY: Summary = {passed: 0, failed: 0, skipped: 0, durationMs: 0}

export const initialRunState: RunState = {phase: 'idle', tests: [], summary: EMPTY_SUMMARY, reason: '', endedFiles: []}

function settled(result: TestRunResult): RunState {
  return {
    phase: result.tests.length > 0 ? 'done' : 'idle',
    tests: result.tests,
    summary: result.summary,
    reason: '',
    endedFiles: [],
  }
}

function running(tests: readonly TestRow[], endedFiles: readonly string[]): RunState {
  const durationMs = tests.reduce((total, test) => total + test.durationMs, 0)
  return {phase: 'running', tests, summary: {...countStates(tests), durationMs}, reason: '', endedFiles}
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
  return state.phase === 'running' ? running(upsert(state.tests, row), state.endedFiles) : running([row], [])
}

function withEndedFile(state: RunState, file: string): RunState {
  if (state.phase !== 'running' || state.endedFiles.includes(file)) return state
  return {...state, endedFiles: [...state.endedFiles, file]}
}

function unavailable(reason: string): RunState {
  return {...initialRunState, phase: 'unavailable', reason}
}

function transitionEvent(state: RunState, event: TestEvent): RunState {
  if (event.type === 'run-start') return running([], [])
  if (event.type === 'file-end') return withEndedFile(state, event.file)
  if (event.type === 'test') return withTest(state, event)
  if (event.type === 'run-end') return settled(event)
  if (event.type === 'run-unavailable') return unavailable(event.reason)
  return state
}

function replay(state: RunState, events: readonly TestEvent[]): RunState {
  return events.reduce(
    (folded, event) =>
      event.type === 'run-start' && folded.phase === 'running' ? folded : transitionEvent(folded, event),
    state,
  )
}

function transitionLoad(state: RunState, action: LoadAction): RunState {
  if (action.type === 'connected') return state.phase === 'running' ? initialRunState : state
  if (action.type === 'status') return state.phase === 'running' ? state : settled(action.result)
  if (action.events !== null) return replay(state, action.events)
  return action.unavailable !== null && state.phase !== 'running' ? unavailable(action.unavailable) : state
}

export function transitionRun(state: RunState, action: RunAction): RunState {
  if (action.type === 'connected' || action.type === 'status' || action.type === 'current')
    return transitionLoad(state, action)
  return transitionEvent(state, action)
}
