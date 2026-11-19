import {countStates, type Summary, type TestEvent, type TestRow, type TestRunResult} from './events.js'

export type RunView =
  | {readonly status: 'idle'}
  | {
      readonly status: 'running'
      readonly tests: readonly TestRow[]
      readonly summary: Summary
      readonly endedFiles: readonly string[]
    }
  | {readonly status: 'done'; readonly tests: readonly TestRow[]; readonly summary: Summary}
  | {readonly status: 'unavailable'; readonly reason: string}

export type RunViewStatus = RunView['status']

type LoadAction =
  | {readonly type: 'connected'}
  | {readonly type: 'status'; readonly result: TestRunResult}
  | {readonly type: 'current'; readonly events: readonly TestEvent[] | null; readonly unavailable: string | null}

export type RunViewAction = TestEvent | LoadAction

const EMPTY_SUMMARY: Summary = {passed: 0, failed: 0, skipped: 0, durationMs: 0}

export const initialRunView: RunView = {status: 'idle'}

export function selectTests(view: RunView): readonly TestRow[] {
  return view.status === 'running' || view.status === 'done' ? view.tests : []
}

export function selectSummary(view: RunView): Summary {
  return view.status === 'running' || view.status === 'done' ? view.summary : EMPTY_SUMMARY
}

export function selectEndedFiles(view: RunView): readonly string[] {
  return view.status === 'running' ? view.endedFiles : []
}

function settled(result: TestRunResult): RunView {
  if (result.tests.length === 0) return initialRunView
  return {status: 'done', tests: result.tests, summary: result.summary}
}

function running(tests: readonly TestRow[], endedFiles: readonly string[]): RunView {
  const durationMs = tests.reduce((total, test) => total + test.durationMs, 0)
  return {status: 'running', tests, summary: {...countStates(tests), durationMs}, endedFiles}
}

function upsert(tests: readonly TestRow[], row: TestRow): TestRow[] {
  const index = tests.findIndex((test) => test.id === row.id)
  return index < 0 ? [...tests, row] : tests.with(index, row)
}

function withTest(view: RunView, event: Extract<TestEvent, {type: 'test'}>): RunView {
  const row: TestRow = {
    id: event.id,
    file: event.file,
    name: event.name,
    state: event.state,
    durationMs: event.durationMs,
    error: event.error,
  }
  return view.status === 'running' ? running(upsert(view.tests, row), view.endedFiles) : running([row], [])
}

function withEndedFile(view: RunView, file: string): RunView {
  if (view.status !== 'running' || view.endedFiles.includes(file)) return view
  return {...view, endedFiles: [...view.endedFiles, file]}
}

function transitionEvent(view: RunView, event: TestEvent): RunView {
  if (event.type === 'run-start') return running([], [])
  if (event.type === 'file-end') return withEndedFile(view, event.file)
  if (event.type === 'test') return withTest(view, event)
  if (event.type === 'run-end') return settled(event)
  if (event.type === 'run-unavailable') return {status: 'unavailable', reason: event.reason}
  return view
}

function replay(view: RunView, events: readonly TestEvent[]): RunView {
  return events.reduce(
    (folded, event) =>
      event.type === 'run-start' && folded.status === 'running' ? folded : transitionEvent(folded, event),
    view,
  )
}

function transitionLoad(view: RunView, action: LoadAction): RunView {
  if (action.type === 'connected') return view.status === 'running' ? initialRunView : view
  if (action.type === 'status') return view.status === 'running' ? view : settled(action.result)
  if (action.events !== null) return replay(view, action.events)
  if (action.unavailable === null || view.status === 'running') return view
  return {status: 'unavailable', reason: action.unavailable}
}

export function transitionRunView(view: RunView, action: RunViewAction): RunView {
  if (action.type === 'connected' || action.type === 'status' || action.type === 'current')
    return transitionLoad(view, action)
  return transitionEvent(view, action)
}
