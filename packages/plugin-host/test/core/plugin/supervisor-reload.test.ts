import {describe, expect} from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import {Deferred, Duration, Effect, Fiber, Layer, LayerMap, Schedule} from 'effect'
import {Bus} from '../../../src/core/bus.js'
import {Watcher} from '../../../src/core/filesystem/watcher.js'
import {Plugin} from '../../../src/core/plugin.js'
import {SdkPlugins} from '../../../src/core/plugin/sdk.js'
import {Rpc} from '../../../src/core/rpc.js'
import {Tool} from '../../../src/core/tool.js'
import {define} from '../../../src/plugin/effect/plugin.js'
import {tmpdirScoped} from '../fixture/tmpdir'
import {advance} from '../lib/clock'
import {testEffect} from '../lib/effect'
import {npmLayer, sharedLayer, supervisorLayer} from './fixture'

const instances = (configured: readonly string[] = []) =>
  LayerMap.make((directory: string) => supervisorLayer(directory, {configured}), {
    idleTimeToLive: Duration.infinity,
  })

const it = testEffect(
  SdkPlugins.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(Bus.layer, Watcher.testLayer, npmLayer)),
    Layer.provideMerge(sharedLayer),
  ),
)

const write = async (file: string, content: string) => {
  await fs.mkdir(path.dirname(file), {recursive: true})
  await fs.writeFile(file, content)
}

const get = (tools: Tool.Interface, name: string) =>
  tools.list().pipe(Effect.map((list) => list.find((tool) => tool.name === name)))

const greeter = (command: string) => `export default {
  id: "greeter",
  async setup(ctx) {
    await ctx.tool.transform((editor) => editor.add({ name: "${command}", description: "", input: {}, execute: async () => ({}) }))
  },
}`

const failed = (plugins: Plugin.Interface) =>
  plugins.list().pipe(
    Effect.flatMap((inventory) => {
      const failure = inventory.find((plugin) => plugin.state.status === 'failed' && plugin.source.type === 'local')
      return failure ? Effect.succeed(failure) : Effect.fail('activation pending')
    }),
    Effect.retry({times: 200, schedule: Schedule.spaced('25 millis')}),
  )

describe('PluginSupervisor reload', () => {
  ;(
    [
      {name: 'on a helper-only save', helper: 'nested/helper.ts', touchEntry: false},
      {name: 'when the entrypoint also changes', helper: 'nested/helper.ts', touchEntry: true},
      {name: 'outside the configured plugin directory', helper: '../shared/helper.ts', touchEntry: false},
    ] as const
  ).forEach((scenario) => {
    it.live(
      `reloads helper-defined RPC methods ${scenario.name}`,
      () =>
        Effect.gen(function* () {
          const directory = yield* tmpdirScoped()
          const root = path.join(directory.path, 'external/greeter')
          const file = path.join(root, 'index.ts')
          const helper = path.join(root, scenario.helper)
          const entry = `export { default } from ${JSON.stringify('./' + scenario.helper)}`
          const source = (version: number) => `import { Schema } from ${JSON.stringify(import.meta.resolve('effect'))}
          export default {
            id: "greeter",
            async setup(ctx) {
              await ctx.rpc.register({ id: "greeter", methods: {
                status: { input: Schema.Unknown, output: Schema.Number },
                ${version > 1 ? 'info: { input: Schema.Unknown, output: Schema.Number },' : ''}
              }, events: {} }, {
                status: async () => ${version},
                ${version > 1 ? `info: async () => ${version},` : ''}
              })
              await ctx.tool.transform(editor => editor.add({ name: "greet_v${version}", description: "", input: {}, execute: async () => ({}) }))
            }
          }`
          yield* Effect.promise(async () => {
            await write(file, entry)
            await write(helper, source(1))
          })
          const watcher = yield* Watcher.Test
          const locations = yield* instances([root])
          yield* Effect.gen(function* () {
            const plugins = yield* Plugin.Service
            const rpc = yield* Rpc.Service
            const tools = yield* Tool.Service
            yield* plugins.awaitActivation
            expect(yield* rpc.call('greeter', 'status', {})).toBe(1)
            expect(yield* rpc.call('greeter', 'info', {}).pipe(Effect.flip)).toMatchObject({
              type: 'rpc.method_not_found',
            })

            yield* Effect.promise(async () => {
              await write(helper, source(2))
              if (scenario.touchEntry) {
                await write(file, entry + '; // updated entry')
                await fs.utimes(file, new Date(), new Date(Date.now() + 1000))
              }
            })
            yield* watcher.emit({path: scenario.touchEntry ? file : helper, type: 'update'})
            yield* rpc
              .call('greeter', 'info', {})
              .pipe(Effect.retry({times: 80, schedule: Schedule.spaced('25 millis')}))
            expect(yield* rpc.call('greeter', 'info', {})).toBe(2)
            expect(yield* get(tools, 'greet_v1')).toBeUndefined()
            expect(yield* get(tools, 'greet_v2')).toBeDefined()

            yield* Effect.promise(() => write(helper, 'throw new Error("broken helper"); export default {}'))
            yield* watcher.emit({path: helper, type: 'update'})
            yield* failed(plugins)
            expect(yield* rpc.call('greeter', 'info', {})).toBe(2)
            yield* Effect.promise(() => write(helper, source(3)))
            yield* watcher.emit({path: helper, type: 'update'})
            yield* get(tools, 'greet_v3').pipe(
              Effect.flatMap((tool) => (tool ? Effect.void : Effect.fail('activation pending'))),
              Effect.retry({times: 80, schedule: Schedule.spaced('25 millis')}),
            )
            expect(yield* rpc.call('greeter', 'info', {})).toBe(3)
            expect(yield* get(tools, 'greet_v2')).toBeUndefined()
          }).pipe(Effect.scoped, Effect.provide(locations.get(directory.path)))
        }),
      30_000,
    )
  })
  ;(['discovered', 'configured'] as const).forEach((mode) => {
    it.effect(
      `retains a ${mode} plugin change during initial activation`,
      () =>
        Effect.gen(function* () {
          const directory = yield* tmpdirScoped()
          const file = path.join(
            directory.path,
            mode === 'discovered' ? 'conciv/plugins/greeter.ts' : 'external/greeter/index.ts',
          )
          yield* Effect.promise(async () => {
            await write(file, greeter('greet_v1'))
            await fs.utimes(file, new Date(0), new Date(0))
          })
          const entered = yield* Deferred.make<void>()
          const gate = yield* Deferred.make<void>()
          const sdk = yield* SdkPlugins.Service
          yield* sdk.register(
            define({
              id: 'gated',
              effect: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(gate))),
            }),
          )
          const watcher = yield* Watcher.Test
          const locations = yield* instances(mode === 'configured' ? [path.dirname(file)] : [])
          yield* Effect.gen(function* () {
            const plugins = yield* Plugin.Service
            const tools = yield* Tool.Service
            yield* Deferred.await(entered)
            yield* Effect.promise(async () => {
              await write(file, greeter('greet_v2'))
              await fs.utimes(file, new Date(), new Date())
            })
            yield* watcher.emit({path: file, type: 'update'})
            const ready = yield* plugins.awaitActivation.pipe(Effect.forkScoped({startImmediately: true}))
            yield* Deferred.succeed(gate, undefined)
            yield* advance(() => ready.pollUnsafe() !== undefined)
            yield* Fiber.join(ready)

            expect(yield* get(tools, 'greet_v1')).toBeUndefined()
            expect(yield* get(tools, 'greet_v2')).toBeDefined()
          }).pipe(Effect.scoped, Effect.provide(locations.get(directory.path)))
        }),
      30_000,
    )
  })
})
