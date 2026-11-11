import {eventIterator, os, type ErrorMap, type Procedure, type Schema} from '@orpc/server'
import {z} from 'zod'
import {defineExtension, subscriptionIterator} from '@conciv/extension'
import {TEST_RUNNER_NAME, TEST_RUNNER_PROMPT, testRunnerConfig} from './shared/meta.js'
import {testTool} from './tool/server.js'
import {getRunner} from './runner/registry.js'
import {vitest} from './runners/vitest/adapter.js'
import {
  isRunnerUnavailable,
  type ListResult,
  type RunnerUnavailableError,
  type TestRunnerManager,
  type UiServerInfo,
} from './runner/contract.js'
import type {TestEvent, TestRunResult} from './shared/events.js'

const RunArgsSchema = z.object({
  patterns: z.array(z.string()).optional(),
  testNamePattern: z.string().optional(),
  failedOnly: z.boolean().default(false),
})

function runnerUnavailableIn(error: unknown): RunnerUnavailableError | null {
  const original = error instanceof Error && error.cause !== undefined ? error.cause : error
  return isRunnerUnavailable(original) ? original : null
}

const runnerOs = os.$context<{request: Request}>()
const unavailable = {
  UNAVAILABLE: {message: 'runner unavailable', data: z.object({available: z.literal(false), error: z.string()})},
}

type UnavailableErrors = {UNAVAILABLE: (opts: {data: {available: false; error: string}}) => Error}

async function guarded<T>(errors: UnavailableErrors, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    const reason = runnerUnavailableIn(error)
    if (reason) throw errors.UNAVAILABLE({data: {available: false, error: reason.message}})
    throw error
  }
}

const ListInputSchema = z.object({failedOnly: z.boolean().default(false)})

type RunnerProcedure<
  Input extends Schema<unknown, unknown>,
  Output extends Schema<unknown, unknown>,
  Errors extends ErrorMap,
> = Procedure<{request: Request}, {request: Request}, Input, Output, Errors, Record<never, never>>
type Unavailable = typeof unavailable
type NoInput = Schema<unknown, unknown>
export type TestRunnerRouter = {
  status: RunnerProcedure<NoInput, Schema<TestRunResult, TestRunResult>, Record<never, never>>
  list: RunnerProcedure<typeof ListInputSchema, Schema<ListResult, ListResult>, Unavailable>
  ui: RunnerProcedure<NoInput, Schema<UiServerInfo, UiServerInfo>, Unavailable>
  run: RunnerProcedure<typeof RunArgsSchema, Schema<TestRunResult, TestRunResult>, Unavailable>
  stop: RunnerProcedure<NoInput, Schema<{ok: boolean}, {ok: boolean}>, Record<never, never>>
  stream: RunnerProcedure<NoInput, ReturnType<typeof eventIterator<TestEvent, TestEvent>>, Record<never, never>>
}

export function makeTestRunnerRouter(manager: TestRunnerManager): TestRunnerRouter {
  return runnerOs.router({
    status: runnerOs.handler(() => manager.status()),
    list: runnerOs
      .errors(unavailable)
      .input(ListInputSchema)
      .handler(({input, errors}) => guarded(errors, () => manager.list(input.failedOnly))),
    ui: runnerOs.errors(unavailable).handler(({errors}) => guarded(errors, () => manager.openUiServer())),
    run: runnerOs
      .errors(unavailable)
      .input(RunArgsSchema)
      .handler(({input, errors}) => guarded(errors, () => manager.run(input))),
    stop: runnerOs.handler(async () => {
      await manager.stop()
      return {ok: true}
    }),
    stream: runnerOs.output(eventIterator(z.custom<TestEvent>())).handler(async function* ({signal}) {
      yield* subscriptionIterator<TestEvent>((emit) => {
        emit(manager.emitSnapshot())
        return manager.subscribeRaw(emit)
      }, signal)
    }),
  })
}

export default defineExtension({
  name: TEST_RUNNER_NAME,
  configSchema: testRunnerConfig,
  tools: [testTool],
  systemPrompt: TEST_RUNNER_PROMPT,
}).server((server) => {
  const adapter = getRunner(server.config.runner) ?? vitest
  const manager = adapter.create(server.cwd)
  return {
    context: {manager},
    router: makeTestRunnerRouter(manager),
    dispose: () => manager.stop(),
  }
})
