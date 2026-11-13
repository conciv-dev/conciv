import {describe, expect} from 'vitest'
import {Deferred, Duration, Effect, Layer, LayerMap, Stream} from 'effect'
import {TestClock} from 'effect/testing'
import {Bus} from '../../../src/core/bus.js'
import {ConfigPluginSource} from '../../../src/core/config/plugin/source.js'
import {Watcher} from '../../../src/core/filesystem/watcher.js'
import {Plugin} from '../../../src/core/plugin.js'
import {SdkPlugins} from '../../../src/core/plugin/sdk.js'
import {Tool} from '../../../src/core/tool.js'
import {define} from '../../../src/plugin/effect/plugin.js'
import {tmpdirScoped} from '../fixture/tmpdir'
import {advance} from '../lib/clock'
import {testEffect} from '../lib/effect'
import {npmLayer, sharedLayer, supervisorLayer} from './fixture'

const id = Plugin.Id.make('account-prompts')

const greeter = (command: string, plugin: string = id) =>
  define({
    id: plugin,
    effect: (ctx) =>
      ctx.tool
        .transform((editor) =>
          editor.add({name: command, description: '', input: {}, execute: () => Effect.succeed({})}),
        )
        .pipe(Effect.asVoid),
  })

const get = (tools: Tool.Interface, name: string) =>
  tools.list().pipe(Effect.map((list) => list.find((tool) => tool.name === name)))

const source: {activations: number; operations: ConfigPluginSource.Operation[]} = {activations: 0, operations: []}
const sourceLayer = Layer.succeed(
  ConfigPluginSource.Service,
  ConfigPluginSource.Service.of({
    operations: () =>
      Effect.sync(() => {
        source.activations++
        return source.operations
      }),
    changes: () => Stream.never,
  }),
)

const instances = LayerMap.make(
  (directory: string) => supervisorLayer(directory, {plugins: [greeter('instance_greet')], source: sourceLayer}),
  {idleTimeToLive: Duration.infinity},
)

const it = testEffect(
  SdkPlugins.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(Bus.layer, Watcher.testLayer, npmLayer)),
    Layer.provideMerge(sharedLayer),
  ),
)

describe('PluginSupervisor', () => {
  it.live('reports a duplicate plugin ID as a failure without dropping the generation', () =>
    Effect.gen(function* () {
      const sdk = yield* SdkPlugins.Service
      yield* sdk.register(greeter('host_greet'))
      const directory = yield* tmpdirScoped()
      const locations = yield* instances
      const state = yield* Effect.gen(function* () {
        const plugins = yield* Plugin.Service
        yield* plugins.awaitActivation
        const tools = yield* Tool.Service
        return {
          inventory: yield* plugins.list(),
          host: yield* get(tools, 'host_greet'),
          instance: yield* get(tools, 'instance_greet'),
        }
      }).pipe(Effect.scoped, Effect.provide(locations.get(directory.path)))

      expect(state.inventory.filter((plugin) => plugin.id === id)).toEqual([
        {id, source: {type: 'sdk'}, state: {status: 'active'}, features: {server: true}},
        {
          id,
          source: {type: 'sdk'},
          state: {status: 'failed', error: `Duplicate plugin ID: ${id}`},
          features: {server: true},
        },
      ])
      expect(state.host).toBeDefined()
      expect(state.instance).toBeUndefined()
      expect(
        state.inventory.some((plugin) => plugin.id?.startsWith('conciv.') && plugin.state.status === 'active'),
      ).toBe(true)
    }),
  )

  it.effect('activates the initial generation without waiting for the reload debounce', () =>
    Effect.gen(function* () {
      source.activations = 0
      const directory = yield* tmpdirScoped()
      const locations = yield* instances
      yield* Effect.gen(function* () {
        const plugins = yield* Plugin.Service
        const tools = yield* Tool.Service
        yield* plugins.awaitActivation
        expect(yield* get(tools, 'instance_greet')).toBeDefined()
      }).pipe(Effect.scoped, Effect.provide(locations.get(directory.path)))
      expect(source.activations).toBe(1)
    }),
  )

  it.effect('refreshes every 24 hours without adding an immediate reload', () =>
    Effect.gen(function* () {
      source.activations = 0
      const directory = yield* tmpdirScoped()
      const locations = yield* instances
      yield* Effect.gen(function* () {
        const plugins = yield* Plugin.Service
        yield* plugins.awaitActivation
        yield* TestClock.adjust('23 hours')
        expect(source.activations).toBe(1)

        yield* TestClock.adjust('1 hour')
        yield* advance(() => source.activations === 2)
        yield* plugins.awaitActivation

        yield* TestClock.adjust('24 hours')
        yield* advance(() => source.activations === 3)
        yield* plugins.awaitActivation
        expect(source.activations).toBe(3)
      }).pipe(Effect.scoped, Effect.provide(locations.get(directory.path)))
    }),
  )

  it.effect('reloads for a trigger published while the initial generation is activating', () =>
    Effect.gen(function* () {
      source.activations = 0
      const sdk = yield* SdkPlugins.Service
      const entered = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      yield* sdk.register(
        define({
          id: 'gated',
          effect: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(gate))),
        }),
      )
      let late = false
      const directory = yield* tmpdirScoped()
      const locations = yield* instances
      yield* Effect.gen(function* () {
        const plugins = yield* Plugin.Service
        const tools = yield* Tool.Service
        yield* Deferred.await(entered)
        yield* sdk.register(
          define({
            id: 'late',
            effect: (ctx) =>
              ctx.tool
                .transform((editor) =>
                  editor.add({name: 'late_greet', description: '', input: {}, execute: () => Effect.succeed({})}),
                )
                .pipe(Effect.tap(() => Effect.sync(() => (late = true)))),
          }),
        )
        yield* Deferred.succeed(gate, undefined)
        yield* advance(() => late)
        yield* plugins.awaitActivation
        expect(yield* get(tools, 'late_greet')).toBeDefined()
      }).pipe(Effect.scoped, Effect.provide(locations.get(directory.path)))
      expect(source.activations).toBe(2)
    }),
  )

  for (const targets of [['conciv.tool.skill'], ['*']]) {
    it.effect(`applies plugin removals to instance plugins: ${targets}`, () =>
      Effect.gen(function* () {
        source.operations = targets.map((target) => ({type: 'remove', target}))
        const directory = yield* tmpdirScoped()
        const locations = yield* instances
        const inventory = yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          yield* plugins.awaitActivation
          return yield* plugins.list()
        }).pipe(Effect.scoped, Effect.provide(locations.get(directory.path)))
        const status = (id: string) => inventory.find((plugin) => plugin.id === id)?.state.status
        expect(status('conciv.tool.skill')).toBeUndefined()
        expect(inventory.some((plugin) => plugin.id === id)).toBe(targets[0] !== '*')
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            source.operations = []
          }),
        ),
      ),
    )
  }

  it.effect('coalesces a burst of reload triggers after the initial generation into one activation', () =>
    Effect.gen(function* () {
      source.activations = 0
      const sdk = yield* SdkPlugins.Service
      const directory = yield* tmpdirScoped()
      const locations = yield* instances
      yield* Effect.gen(function* () {
        const plugins = yield* Plugin.Service
        const tools = yield* Tool.Service
        yield* plugins.awaitActivation
        expect(source.activations).toBe(1)

        yield* sdk.register(greeter('greet_a', 'a'))
        yield* sdk.register(greeter('greet_b', 'b'))
        yield* sdk.register(greeter('greet_c', 'c'))
        yield* advance(() => source.activations > 1)
        yield* plugins.awaitActivation
        expect(yield* get(tools, 'greet_a')).toBeDefined()
        expect(yield* get(tools, 'greet_c')).toBeDefined()
      }).pipe(Effect.scoped, Effect.provide(locations.get(directory.path)))
      expect(source.activations).toBe(2)
    }),
  )

  it.effect('reloads all booted locations when sdk.register is called inside a location context', () =>
    Effect.gen(function* () {
      source.activations = 0
      const sdk = yield* SdkPlugins.Service
      const directoryA = yield* tmpdirScoped()
      const directoryB = yield* tmpdirScoped()
      const locations = yield* instances

      yield* Effect.gen(function* () {
        const plugins = yield* Plugin.Service
        yield* plugins.awaitActivation
      }).pipe(Effect.provide(locations.get(directoryA.path)))

      yield* Effect.gen(function* () {
        const plugins = yield* Plugin.Service
        yield* plugins.awaitActivation
      }).pipe(Effect.provide(locations.get(directoryB.path)))

      expect(source.activations).toBe(2)

      yield* sdk
        .register(greeter('greet_cross_location', 'cross-location'))
        .pipe(Effect.provide(locations.get(directoryA.path)))

      yield* advance(() => source.activations === 4)

      for (const directory of [directoryA, directoryB]) {
        const tool = yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          const tools = yield* Tool.Service
          yield* plugins.awaitActivation
          return yield* get(tools, 'greet_cross_location')
        }).pipe(Effect.provide(locations.get(directory.path)))
        expect(tool).toBeDefined()
      }
    }),
  )
})
