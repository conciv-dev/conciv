import type {TestRunnerAdapter} from './contract.js'
import {vitest} from '../runners/vitest/adapter.js'
import {jest} from '../runners/jest.js'
import {nodeTest} from '../runners/node-test.js'
import {playwright} from '../runners/playwright/adapter.js'

// The self-describing runner adapters. No central registry/Map/register() — dispatch by id from
// this array (each adapter carries its own id, capabilities, and create()).
export const adapters: TestRunnerAdapter[] = [vitest, jest, nodeTest, playwright]

export function getRunner(id: string): TestRunnerAdapter | undefined {
  return adapters.find((adapter) => adapter.id === id)
}
