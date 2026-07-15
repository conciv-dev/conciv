import {eventIterator, os} from '@orpc/server'
import {z} from 'zod'
import {defineExtension, subscriptionIterator} from '@conciv/extension'
import {TEST_RUNNER_NAME, TEST_RUNNER_PROMPT, testRunnerConfig} from './shared/meta.js'
import {testTool} from './tool/server.js'
import {getRunner} from './runner/registry.js'
import {vitest} from './runners/vitest/adapter.js'
import {isRunnerUnavailable, type RunnerUnavailableError, type TestRunnerManager} from './runner/contract.js'
import type {TestEvent} from './shared/events.js'

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

export function makeTestRunnerRouter(manager: TestRunnerManager) {
  return runnerOs.router({
    status: runnerOs.handler(() => manager.status()),
    list: runnerOs
      .errors(unavailable)
      .input(z.object({failedOnly: z.boolean().default(false)}))
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

export type TestRunnerRouter = ReturnType<typeof makeTestRunnerRouter>

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
