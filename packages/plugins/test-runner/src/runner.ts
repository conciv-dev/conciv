import {Data, type Effect, type Scope, type Stream} from 'effect'
import type {ChildProcessSpawner} from 'effect/process/ChildProcessSpawner'
import type {TestEvent, TestRunResult} from './events.js'

export type RunArgs = {patterns?: string[]; testNamePattern?: string; failedOnly?: boolean}

export type ListFile = {file: string; relPath: string; lastState?: string}

export type ListResult = {files: ListFile[]}

export type UiServerInfo = {available: boolean; url?: string}

export type TestRunnerCapabilities = {
  watch: boolean
  uiServer: boolean
  filterByName: boolean
  failedOnly: boolean
}

export type CurrentRun = {events: TestEvent[] | null; unavailable: string | null}

export const RunnerUnavailable = Data.TaggedError('RunnerUnavailable')<{readonly message: string}>

export type RunnerUnavailable = InstanceType<typeof RunnerUnavailable>

export type RunnerServices = Scope.Scope | ChildProcessSpawner

export type TestRunnerManager = {
  readonly list: (failedOnly: boolean) => Effect.Effect<ListResult, RunnerUnavailable>
  readonly run: (args: RunArgs) => Effect.Effect<TestRunResult, RunnerUnavailable>
  readonly status: Effect.Effect<TestRunResult>
  readonly current: Effect.Effect<CurrentRun>
  readonly events: Stream.Stream<TestEvent>
  readonly openUiServer: Effect.Effect<UiServerInfo>
  readonly stop: Effect.Effect<void>
}

export type TestRunnerAdapter = {
  readonly id: string
  readonly capabilities: TestRunnerCapabilities
  readonly create: (cwd: string) => Effect.Effect<TestRunnerManager, RunnerUnavailable, RunnerServices>
}
