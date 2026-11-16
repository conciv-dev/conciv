import {Plugin} from '@conciv/plugin'
import {z} from 'zod'
import {isRunnerUnavailable, type TestRunnerManager} from './runner/contract.js'
import {getRunner} from './runner/registry.js'
import {vitest} from './runners/vitest/adapter.js'
import {TestRunner} from './rpc.js'
import {info} from './skill.js'
import {register} from './tools.js'

const testRunnerConfig = z.object({
  runner: z.enum(['vitest', 'jest', 'node-test', 'playwright']).default('vitest'),
})

const UNAVAILABLE_MESSAGE = 'runner unavailable'

function unavailableReason(error: unknown): string | null {
  const original = error instanceof Error && error.cause !== undefined ? error.cause : error
  return isRunnerUnavailable(original) ? original.message : null
}

async function guarded<Value, Failure>(
  work: () => Promise<Value>,
  unavailable: (reason: string) => Failure,
): Promise<Value | Failure> {
  try {
    return await work()
  } catch (error) {
    const reason = unavailableReason(error)
    if (reason === null) throw error
    return unavailable(reason)
  }
}

function registerRpc(rpc: Plugin.Context['rpc'], manager: TestRunnerManager) {
  return rpc.register(TestRunner, {
    status: async () => manager.status(),
    list: (input, {error}) =>
      guarded(
        () => manager.list(input.failedOnly),
        (reason) => error('UNAVAILABLE', UNAVAILABLE_MESSAGE, {available: false, error: reason}),
      ),
    ui: (_input, {error}) =>
      guarded(
        () => manager.openUiServer(),
        (reason) => error('UNAVAILABLE', UNAVAILABLE_MESSAGE, {available: false, error: reason}),
      ),
    run: (input, {error}) =>
      guarded(
        () => manager.run(input),
        (reason) => error('UNAVAILABLE', UNAVAILABLE_MESSAGE, {available: false, error: reason}),
      ),
    stop: async () => {
      await manager.stop()
      return {ok: true}
    },
  })
}

export default Plugin.define({
  id: 'test-runner',
  async setup(ctx) {
    const config = testRunnerConfig.parse(ctx.options)
    const adapter = getRunner(config.runner) ?? vitest
    const manager = adapter.create(ctx.location.directory)
    await register(ctx.tool, manager)
    await ctx.skill.transform((editor) => editor.add(info))
    const registration = await registerRpc(ctx.rpc, manager)
    const unsubscribe = manager.subscribeRaw((event) => {
      registration.events.emit('event', event).catch((error: unknown) => {
        console.error(`[test-runner] a live test event was not delivered: ${String(error)}`)
      })
    })
    return () => {
      unsubscribe()
      return manager.stop()
    }
  },
})
