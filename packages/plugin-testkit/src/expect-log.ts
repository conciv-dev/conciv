import type {TaskMeta} from 'vitest'
import {declareExpectedLog} from '@conciv/vitest-config/expected-log'

export type ExpectLog = (pattern: RegExp) => void

export async function provideExpectLog(
  {task}: {task: {readonly meta: TaskMeta}},
  use: (value: ExpectLog) => Promise<void>,
): Promise<void> {
  await use((pattern) => declareExpectedLog(task, pattern))
}
