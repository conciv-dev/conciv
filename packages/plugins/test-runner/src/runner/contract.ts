import {z} from 'zod'
import type {TestEvent, TestRunResult} from '../shared/events.js'

export type RunArgs = {patterns?: string[]; testNamePattern?: string; failedOnly?: boolean}

export type ListResult = {files: {file: string; relPath: string; lastState?: string}[]}

export type UiServerInfo = {available: boolean; url?: string}

export type TestRunnerCapabilities = {
  watch: boolean
  uiServer: boolean
  filterByName: boolean
  failedOnly: boolean
}

export type TestRunnerManager = {
  list: (failedOnly?: boolean) => Promise<ListResult>
  run: (args: RunArgs) => Promise<TestRunResult>
  status: () => TestRunResult
  subscribeRaw: (cb: (e: TestEvent) => void) => () => void
  emitSnapshot: () => TestEvent
  openUiServer: () => Promise<UiServerInfo>
  stop: () => Promise<void>
}

export type TestRunnerAdapter = {
  id: string
  capabilities: TestRunnerCapabilities
  create: (cwd: string) => TestRunnerManager
}

const RUNNER_UNAVAILABLE_TAG = 'conciv:runner-unavailable'
export type RunnerUnavailableError = Error & {[RUNNER_UNAVAILABLE_TAG]: true; available: false}

export function runnerUnavailableError(runnerId: string, reason: string): RunnerUnavailableError {
  return Object.assign(new Error(`${runnerId} unavailable: ${reason}`), {
    [RUNNER_UNAVAILABLE_TAG]: true as const,
    available: false as const,
  })
}

const UnavailableTagSchema = z.object({[RUNNER_UNAVAILABLE_TAG]: z.literal(true)})

export function isRunnerUnavailable(e: unknown): e is RunnerUnavailableError {
  return e instanceof Error && UnavailableTagSchema.safeParse(e).success
}

export function defineRunner<T extends TestRunnerAdapter>(adapter: T): T {
  if (!adapter.id) throw new Error('runner: id is required')
  if (typeof adapter.create !== 'function') throw new Error(`runner "${adapter.id}": create() factory is required`)
  return adapter
}
