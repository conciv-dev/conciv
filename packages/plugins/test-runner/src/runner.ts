import type {Effect, Scope, Stream} from 'effect'
import type {EvlogError} from 'evlog'
import type {ChildProcessSpawner} from 'effect/process/ChildProcessSpawner'
import type {TestEvent, TestRunResult} from './events.js'

export type RunArgs = {patterns?: string[]; testNamePattern?: string; failedOnly?: boolean}

export type ListFile = {file: string; relPath: string}

type ListResult = {files: ListFile[]}

export type CurrentRun = {events: TestEvent[] | null; unavailable: string | null}

export type RunnerServices = Scope.Scope | ChildProcessSpawner

export type TestRunnerManager = {
  readonly list: (failedOnly: boolean) => Effect.Effect<ListResult, EvlogError>
  readonly run: (args: RunArgs) => Effect.Effect<TestRunResult, EvlogError>
  readonly status: Effect.Effect<TestRunResult>
  readonly current: Effect.Effect<CurrentRun>
  readonly events: Stream.Stream<TestEvent>
  readonly stop: Effect.Effect<void>
}

export type TestRunnerAdapter = {
  readonly id: string
  readonly create: (cwd: string) => Effect.Effect<TestRunnerManager, EvlogError, RunnerServices>
}
