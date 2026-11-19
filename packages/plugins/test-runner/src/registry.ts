import type {TestRunnerAdapter} from './runner.js'
import {vitest} from './vitest.js'
import {jest} from './jest.js'
import {nodeTest} from './node-test.js'
import {playwright} from './playwright.js'

const adapters: TestRunnerAdapter[] = [vitest, jest, nodeTest, playwright]

export function getRunner(id: string): TestRunnerAdapter | undefined {
  return adapters.find((adapter) => adapter.id === id)
}
