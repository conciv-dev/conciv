import type {TestRunnerAdapter} from '@aidx/protocol/runner-types'
import {vitest} from './vitest/vitest.js'
import {jest} from './jest/jest.js'
import {nodeTest} from './node-test/node-test.js'
import {playwright} from './playwright/playwright.js'

// Runner registry: adapters register their id; @aidx/core resolves config.testRunner.
// Third parties may registerRunner() at runtime against @aidx/protocol's interfaces.
const registry = new Map<string, TestRunnerAdapter>()

export function registerRunner(adapter: TestRunnerAdapter): void {
  registry.set(adapter.id, adapter)
}

export function getRunner(id: string): TestRunnerAdapter | undefined {
  return registry.get(id)
}

export function listRunners(): TestRunnerAdapter[] {
  return [...registry.values()]
}

// Bundled adapters self-register on import of the package entry.
for (const adapter of [vitest, jest, nodeTest, playwright]) registerRunner(adapter)

// The driver + child-runner authoring seam are part of this package's public API (the factory
// wires create() to the runtime spawn driver, so it can't live in zero-runtime @aidx/protocol).
export {makeChildManager, defineChildRunner, isRunnerUnavailable, runnerUnavailableError} from './driver.js'
export type {ChildRunnerSpec, SpawnRunner, MakeManagerOptions, RunnerUnavailableError} from './driver.js'
