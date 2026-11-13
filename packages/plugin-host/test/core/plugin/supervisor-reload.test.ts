import {describe, expect} from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import {setTimeout} from 'node:timers/promises'
import {Deferred, Duration, Effect, Fiber, Layer, LayerMap, Schedule} from 'effect'
import {TestClock} from 'effect/testing'
import {Bus} from '../../../src/core/bus.js'
import {Watcher} from '../../../src/core/filesystem/watcher.js'
import {Plugin} from '../../../src/core/plugin.js'
import {SdkPlugins} from '../../../src/core/plugin/sdk.js'
import {Rpc} from '../../../src/core/rpc.js'
import {Tool} from '../../../src/core/tool.js'
import {define} from '../../../src/plugin/effect/plugin.js'
import {Npm} from '../../../src/util/npm.js'
import {tmpdirScoped} from '../fixture/tmpdir'
import {advance} from '../lib/clock'
import {testEffect} from '../lib/effect'
import {sharedLayer, supervisorLayer} from './fixture'

const npm = {
  directory: '',
  gate: undefined as Deferred.Deferred<void> | undefined,
  inflight: 0,
  peak: 0,
}

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: (name) => Effect.succeed({directory: npm.directory, name}),
    resolve: (name) =>
      Effect.gen(function* () {
        npm.inflight++
        npm.peak = Math.max(npm.peak, npm.inflight)
        if (npm.gate) yield* Deferred.await(npm.gate)
        npm.inflight--
        return {directory: npm.directory, name}
      }),
    check: () => Effect.succeed(false),
    update: (name) => Effect.succeed({directory: npm.directory, name}),
    which: () => Effect.undefined,
  }),
)

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

const settle = (predicate: () => boolean, attempts = 200): Effect.Effect<void, string> =>
  Effect.suspend(() => {
    if (predicate()) return Effect.void
    if (attempts === 0) return Effect.fail('not settled')
    return Effect.promise(() => setTimeout(10)).pipe(Effect.andThen(settle(predicate, attempts - 1)))
  })

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

  it.live(
    'keeps the running generation when an updated local plugin fails to import',
    () =>
      Effect.gen(function* () {
        const directory = yield* tmpdirScoped()
        const file = path.join(directory.path, 'conciv/plugins/greeter.ts')
        const save = (content: string, mtime: Date) =>
          Effect.promise(async () => {
            await write(file, content)
            await fs.utimes(file, mtime, mtime)
          })
        yield* save(greeter('greet_v1'), new Date(Date.now() - 60_000))
        const bus = yield* Bus.Service
        const locations = yield* instances()
        yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          const tools = yield* Tool.Service
          yield* plugins.awaitActivation
          expect(yield* get(tools, 'greet_v1')).toBeDefined()

          yield* save('export default {', new Date())
          yield* bus.publish(SdkPlugins.Updated, {})
          const failure = yield* failed(plugins)

          expect(failure).toMatchObject({source: {type: 'local', path: file}, state: {status: 'failed'}})
          expect(yield* get(tools, 'greet_v1')).toBeDefined()
          expect(yield* plugins.list()).toContainEqual(
            expect.objectContaining({
              id: 'greeter',
              source: {type: 'local', path: file},
              state: {status: 'active'},
            }),
          )
        }).pipe(Effect.scoped, Effect.provide(locations.get(directory.path)))
      }),
    30_000,
  )

  it.effect(
    'serializes the periodic refresh behind an in-flight reload',
    () =>
      Effect.gen(function* () {
        const directory = yield* tmpdirScoped()
        npm.directory = path.join(directory.path, 'fixture-pkg')
        npm.gate = undefined
        npm.peak = 0
        yield* Effect.promise(() =>
          write(
            path.join(npm.directory, 'package.json'),
            JSON.stringify({name: 'fixture-pkg', exports: {'./server': './server.ts'}}),
          ),
        )
        yield* Effect.promise(() => write(path.join(npm.directory, 'server.ts'), greeter('greet_pkg')))
        const bus = yield* Bus.Service
        const locations = yield* instances(['fixture-pkg'])
        yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          const tools = yield* Tool.Service
          yield* TestClock.adjust('100 millis')
          yield* plugins.awaitActivation
          expect(yield* get(tools, 'greet_pkg')).toBeDefined()
          expect(npm.peak).toBe(1)

          const gate = yield* Deferred.make<void>()
          npm.gate = gate
          npm.inflight = 0
          npm.peak = 0
          yield* bus.publish(SdkPlugins.Updated, {})
          yield* TestClock.adjust('100 millis')
          yield* settle(() => npm.inflight === 1)
          yield* TestClock.adjust('24 hours')
          yield* settle(() => npm.peak > 1, 50).pipe(Effect.ignore)
          const peak = npm.peak
          yield* Deferred.succeed(gate, undefined)
          npm.gate = undefined
          yield* TestClock.adjust('100 millis')
          yield* plugins.awaitActivation

          expect(peak).toBe(1)
        }).pipe(Effect.scoped, Effect.provide(locations.get(directory.path)))
      }),
    30_000,
  )
})
