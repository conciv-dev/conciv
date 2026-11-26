import type {TestEvent, TestRunResult} from './events.js'

export function createTestRunState() {
  const events: TestEvent[] = []
  const last: {result: TestRunResult} = {
    result: {summary: {passed: 0, failed: 0, skipped: 0, durationMs: 0}, failures: [], tests: []},
  }
  return {
    events,
    last,
    handlers: {status: () => last.result, current: () => ({events, unavailable: null})},
  }
}
