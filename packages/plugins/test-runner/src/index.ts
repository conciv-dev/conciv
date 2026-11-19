import {Plugin} from '@conciv/plugin/effect'
import type {Context} from '@conciv/plugin/effect/plugin'
import {Effect, Queue, Stream} from 'effect'
import {z} from 'zod'
import {isRunnerUnavailable, type TestRunnerManager} from './runner/contract.js'
import {getRunner} from './runner/registry.js'
import {vitest} from './runners/vitest/adapter.js'
import type {TestEvent} from './shared/events.js'
import {TestRunner} from './rpc.js'
import {info} from './skill.js'
import {register} from './tools.js'

const testRunnerConfig = z.object({
  runner: z.enum(['vitest', 'jest', 'node-test', 'playwright']).default('vitest'),
})

const UNAVAILABLE_MESSAGE = 'runner unavailable'

const OK: {ok: true} = {ok: true}

function unavailableReason(error: unknown): string | null {
  const original = error instanceof Error && error.cause !== undefined ? error.cause : error
  return isRunnerUnavailable(original) ? original.message : null
}

function guarded<Value, Failure>(
  work: () => Promise<Value>,
  unavailable: (reason: string) => Failure,
): Effect.Effect<Value, Failure> {
  return Effect.tryPromise({try: work, catch: (error) => error}).pipe(
    Effect.catch((error) => {
      const reason = unavailableReason(error)
      if (reason === null) return Effect.die(error)
      return Effect.fail(unavailable(reason))
    }),
  )
}

function reportUndelivered(error: unknown) {
  return Effect.sync(() => {
    console.error(`[test-runner] a live test event was not delivered: ${String(error)}`)
  })
}

function registerRpc(rpc: Context['rpc'], manager: TestRunnerManager) {
  return rpc.register(TestRunner, {
    status: () => Effect.sync(() => manager.status()),
    current: () => Effect.sync(() => manager.current()),
    list: (input, call) =>
      guarded(
        () => manager.list(input.failedOnly),
        (reason) => call.error('UNAVAILABLE', UNAVAILABLE_MESSAGE, {available: false, error: reason}),
      ),
    ui: (_input, call) =>
      guarded(
        () => manager.openUiServer(),
        (reason) => call.error('UNAVAILABLE', UNAVAILABLE_MESSAGE, {available: false, error: reason}),
      ),
    run: (input, call) =>
      guarded(
        () => manager.run(input),
        (reason) => call.error('UNAVAILABLE', UNAVAILABLE_MESSAGE, {available: false, error: reason}),
      ),
    stop: () => Effect.promise(() => manager.stop()).pipe(Effect.as(OK)),
  })
}

export default Plugin.define({
  id: 'test-runner',
  effect: (ctx) =>
    Effect.gen(function* () {
      const manager = yield* Effect.sync(() => {
        const config = testRunnerConfig.parse(ctx.options)
        const adapter = getRunner(config.runner) ?? vitest
        return adapter.create(ctx.location.directory)
      })
      yield* register(ctx, manager)
      yield* ctx.skill.transform((editor) => editor.add(info))
      const registration = yield* registerRpc(ctx.rpc, manager).pipe(Effect.orDie)
      const events = yield* Queue.unbounded<TestEvent>()
      yield* Stream.fromQueue(events).pipe(
        Stream.runForEach((event) =>
          registration.events
            .emit('event', event)
            .pipe(Effect.catch(reportUndelivered), Effect.catchDefect(reportUndelivered)),
        ),
        Effect.forkScoped({startImmediately: true}),
      )
      const unsubscribe = manager.subscribeRaw((event) => {
        Queue.offerUnsafe(events, event)
      })
      yield* Effect.addFinalizer(() =>
        Effect.sync(unsubscribe).pipe(Effect.andThen(Effect.promise(() => manager.stop()))),
      )
    }),
})
