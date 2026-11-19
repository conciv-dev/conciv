import {Schema, type Effect, type Scope, type Stream} from 'effect'
import type {ChildProcessSpawner} from 'effect/process/ChildProcessSpawner'
import type {TestEvent, TestRunResult} from './events.js'

export type RunArgs = {patterns?: string[]; testNamePattern?: string; failedOnly?: boolean}

export type ListFile = {file: string; relPath: string}

type ListResult = {files: ListFile[]}

export type CurrentRun = {events: TestEvent[] | null; unavailable: string | null}

export const RunnerUnavailable = Schema.TaggedStruct('TestRunner.RunnerUnavailable', {message: Schema.String})
export type RunnerUnavailable = typeof RunnerUnavailable.Type & globalThis.Error
export const makeRunnerUnavailable = (fields: Omit<typeof RunnerUnavailable.Type, '_tag'>): RunnerUnavailable =>
  Object.assign(new globalThis.Error(fields.message), RunnerUnavailable.make(fields), {
    name: 'TestRunner.RunnerUnavailable',
  })

export type RunnerServices = Scope.Scope | ChildProcessSpawner

export type TestRunnerManager = {
  readonly list: (failedOnly: boolean) => Effect.Effect<ListResult, RunnerUnavailable>
  readonly run: (args: RunArgs) => Effect.Effect<TestRunResult, RunnerUnavailable>
  readonly status: Effect.Effect<TestRunResult>
  readonly current: Effect.Effect<CurrentRun>
  readonly events: Stream.Stream<TestEvent>
  readonly stop: Effect.Effect<void>
}

export type TestRunnerAdapter = {
  readonly id: string
  readonly create: (cwd: string) => Effect.Effect<TestRunnerManager, RunnerUnavailable, RunnerServices>
}
