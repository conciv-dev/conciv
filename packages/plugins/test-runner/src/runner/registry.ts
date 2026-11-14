import type {TestRunnerAdapter} from './contract.js'
import {vitest} from '../runners/vitest/adapter.js'
import {jest} from '../runners/jest.js'
import {nodeTest} from '../runners/node-test.js'
import {playwright} from '../runners/playwright/adapter.js'

export const adapters: TestRunnerAdapter[] = [vitest, jest, nodeTest, playwright]

export function getRunner(id: string): TestRunnerAdapter | undefined {
  return adapters.find((adapter) => adapter.id === id)
}
