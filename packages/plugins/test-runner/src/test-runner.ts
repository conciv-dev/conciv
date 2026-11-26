import {Plugin} from '@conciv/backend-plugin-api/effect'
import type {Context} from '@conciv/backend-plugin-api/effect/plugin'
import {Effect, Stream} from 'effect'
import type {RunnerServices, RunnerUnavailable, TestRunnerAdapter, TestRunnerManager} from './runner.js'
import {TestRunner} from './rpc.js'
import {info} from './skill.js'
import {register} from './tools.js'
import {vitest} from './vitest.js'
import {playwright} from './playwright.js'
import {defineStubRunner} from './run.js'
import {TestRunnerConfigSchema} from './config.js'

const jest = defineStubRunner({
  id: 'jest',
  reason: 'jest runner not implemented',
})

const nodeTest = defineStubRunner({
  id: 'node-test',
  reason: 'node-test runner not implemented',
})

const adapters: TestRunnerAdapter[] = [vitest, jest, nodeTest, playwright]

function getRunner(id: string): TestRunnerAdapter | undefined {
  return adapters.find((adapter) => adapter.id === id)
}

const UNAVAILABLE_MESSAGE = 'runner unavailable'

const OK: {ok: true} = {ok: true}

function registerRpc(rpc: Context['rpc'], manager: TestRunnerManager) {
  return rpc.register(TestRunner, {
    status: () => manager.status,
    current: () => manager.current,
    list: (input, call) =>
      manager
        .list(input.failedOnly)
        .pipe(
          Effect.catchTag('TestRunner.RunnerUnavailable', (error: RunnerUnavailable) =>
            Effect.fail(call.error('UNAVAILABLE', UNAVAILABLE_MESSAGE, {available: false, error: error.message})),
          ),
        ),
    run: (input, call) =>
      manager
        .run(input)
        .pipe(
          Effect.catchTag('TestRunner.RunnerUnavailable', (error: RunnerUnavailable) =>
            Effect.fail(call.error('UNAVAILABLE', UNAVAILABLE_MESSAGE, {available: false, error: error.message})),
          ),
        ),
    stop: () => manager.stop.pipe(Effect.as(OK)),
  })
}

export default Plugin.define<RunnerServices>({
  id: 'test-runner',
  effect: Effect.fn('TestRunner.plugin')(function* (ctx: Context) {
    const config = TestRunnerConfigSchema.safeParse(ctx.options)
    if (!config.success) return yield* Effect.die(config.error)
    const adapter = getRunner(config.data.runner) ?? vitest
    const manager = yield* adapter
      .create(ctx.location.directory)
      .pipe(Effect.catchTag('TestRunner.RunnerUnavailable', (error) => Effect.die(error)))
    yield* register(ctx, manager)
    yield* ctx.skill.transform((editor) => editor.add(info))
    const registration = yield* registerRpc(ctx.rpc, manager).pipe(Effect.orDie)
    yield* manager.events.pipe(
      Stream.runForEach((event) =>
        registration.events
          .emit('event', event)
          .pipe(Effect.catchCause((cause) => Effect.logError('a live test event was not delivered', cause))),
      ),
      Effect.forkScoped({startImmediately: true}),
    )
  }),
})
