import type {TestRunnerAdapter} from '@devgent/protocol/runner-types'

// Stub (Task 1) — fleshed out in Task 2 with getRunner/listRunners + driver re-exports.
const registry = new Map<string, TestRunnerAdapter>()

export function registerRunner(adapter: TestRunnerAdapter): void {
  registry.set(adapter.id, adapter)
}
