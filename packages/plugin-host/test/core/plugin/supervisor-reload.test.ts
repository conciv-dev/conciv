import {describe, expect} from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import {setTimeout} from 'node:timers/promises'
import {
  Cause,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  LayerMap,
  Logger,
  Option,
  Queue,
  Schedule,
  Stream,
} from 'effect'
import {z} from 'zod'
import {TestClock} from 'effect/testing'
import * as Bundler from '@conciv/plugin/schema/bundler'
import {Agent} from '../../../src/core/agent.js'
import {Bus} from '../../../src/core/bus.js'
import {Watcher} from '../../../src/core/filesystem/watcher.js'
import {Location} from '../../../src/core/location.js'
import {Permission} from '../../../src/core/permission.js'
import {Plugin} from '../../../src/core/plugin.js'
import {SdkPlugins} from '../../../src/core/plugin/sdk.js'
import {Rpc} from '../../../src/core/rpc.js'
import {Session as Sessions} from '../../../src/core/session.js'
import {Tool} from '../../../src/core/tool.js'
import {define} from '@conciv/plugin/effect/plugin'
import {Session} from '@conciv/plugin/schema/session'
import {Tool as ToolSchema} from '@conciv/plugin/schema/tool'
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
  it.live(
    'a host plugin activated last reaches an agent a project plugin adds, also after that plugin reloads',
    () =>
      Effect.gen(function* () {
        const directory = yield* tmpdirScoped()
        const file = path.join(directory.path, 'external/reviewer/index.ts')
        const reviewer = (version: number) => `export default {
  id: "reviewer",
  async setup(ctx) {
    await ctx.agent.transform((editor) => editor.update("reviewer", (agent) => { agent.description = "v${version}" }))
  },
}`
        const ask = {action: 'page_eval', resource: '*', effect: 'ask'} as const
        const everyAgentAsks = define({
          id: 'every-agent-asks',
          effect: (ctx) =>
            ctx.agent
              .transform((editor) => editor.list().forEach((agent) => agent.permissions.push(ask)))
              .pipe(Effect.asVoid),
        })
        yield* Effect.promise(() => write(file, reviewer(1)))
        const watcher = yield* Watcher.Test
        const locations = yield* LayerMap.make(
          (location: string) =>
            supervisorLayer(location, {configured: [path.dirname(file)], builtin: {post: [everyAgentAsks]}}),
          {idleTimeToLive: Duration.infinity},
        )
        yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          const agents = yield* Agent.Service
          const bus = yield* Bus.Service
          const reviewerId = Agent.Id.make('reviewer')
          yield* plugins.awaitActivation
          expect(yield* agents.get(reviewerId)).toMatchObject({description: 'v1'})
          expect((yield* agents.get(reviewerId))?.permissions).toContainEqual(ask)

          const reloaded = yield* bus.subscribe(Agent.Event.Updated).pipe(
            Stream.mapEffect(() => agents.get(reviewerId)),
            Stream.filter((agent) => agent?.description === 'v2'),
            Stream.runHead,
            Effect.forkScoped({startImmediately: true}),
          )
          yield* Effect.promise(async () => {
            await write(file, reviewer(2))
            await fs.utimes(file, new Date(), new Date(Date.now() + 1000))
          })
          yield* watcher.emit({path: file, type: 'update'})
          expect(Option.getOrUndefined(yield* Fiber.join(reloaded))?.permissions).toContainEqual(ask)
        }).pipe(Effect.scoped, Effect.provide(locations.get(directory.path)))
      }),
    30_000,
  )
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

  it.live(
    'a changed browser bundle alone is served anew without restarting the plugin, an engine edit restarts it',
    () =>
      Effect.gen(function* () {
        const directory = yield* tmpdirScoped()
        const root = path.join(directory.path, 'conciv/plugins/bundled')
        const entry = path.join(root, 'index.ts')
        const starts = path.join(directory.path, 'starts')
        const bundle = path.join(root, 'plugin-experimental.js')
        const code = 'module.exports = { default: function setup() {} }'
        const source = `import { appendFileSync } from "node:fs"
            export default { id: "bundled", async setup(ctx) {
              appendFileSync(${JSON.stringify(starts)}, "x")
              await ctx.tool.transform((editor) => editor.add({ name: "bundled_tool", description: "", input: {}, execute: async () => ({}) }))
            } }`
        const painted = path.join(directory.path, 'conciv/plugins/painted/plugin-experimental.js')
        const marks = Effect.promise(() => fs.readFile(starts, 'utf8'))
        yield* Effect.promise(async () => {
          await write(entry, source)
          await write(bundle, code)
          await write(painted, code)
        })
        const bus = yield* Bus.Service
        const watcher = yield* Watcher.Test
        const updates: string[] = []
        yield* Effect.acquireRelease(
          bus.listen((event) =>
            Effect.sync(() => void (event.type === Plugin.Event.Updated.type && updates.push(event.type))),
          ),
          (unsubscribe) => unsubscribe,
        )
        const locations = yield* instances()
        yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          const tools = yield* Tool.Service
          const id = Plugin.Id.make('bundled')
          const edited = (plugin: Plugin.Id) =>
            plugins.experimental(plugin).pipe(
              Effect.flatMap((part) =>
                part?.code === `${code}\n// edited` ? Effect.succeed(part) : Effect.fail('pending'),
              ),
              Effect.retry({times: 80, schedule: Schedule.spaced('25 millis')}),
            )
          yield* plugins.awaitActivation
          const served = yield* plugins.experimental(id)
          const tool = yield* get(tools, 'bundled_tool')
          const published = updates.length
          expect(served?.code).toBe(code)
          expect(tool).toBeDefined()
          expect(yield* marks).toBe('x')

          yield* Effect.promise(() => write(bundle, `${code}\n// edited`))
          yield* watcher.emit({path: bundle, type: 'update'})
          const reloaded = yield* edited(id)

          expect(reloaded.revision).not.toBe(served?.revision)
          expect(yield* marks).toBe('x')
          expect(updates.length).toBe(published + 1)
          expect(yield* get(tools, 'bundled_tool')).toBe(tool)

          const browserOnly = Plugin.Id.make('painted')
          const paintedServed = yield* plugins.experimental(browserOnly)
          const paintedPublished = updates.length
          expect(paintedServed?.code).toBe(code)
          yield* Effect.promise(() => write(painted, `${code}\n// edited`))
          yield* watcher.emit({path: painted, type: 'update'})
          expect((yield* edited(browserOnly)).revision).not.toBe(paintedServed?.revision)
          expect(updates.length).toBe(paintedPublished + 1)

          yield* Effect.promise(async () => {
            await write(entry, `${source}\nexport const edited = true`)
            await fs.utimes(entry, new Date(), new Date(Date.now() + 1000))
          })
          yield* watcher.emit({path: entry, type: 'update'})
          yield* marks.pipe(
            Effect.flatMap((written) => (written === 'xx' ? Effect.void : Effect.fail('pending'))),
            Effect.retry({times: 80, schedule: Schedule.spaced('25 millis')}),
          )
          expect(yield* marks).toBe('xx')
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

const restarts: boolean[] = []

const bundler = Bundler.defineBundlerBridge({
  id: 'later-agent-bundler',
  config: () => ({root: '/repo', base: '/', mode: 'development', aliases: [], plugins: []}),
  resolve: async () => ({id: null}),
  moduleGraph: () => [],
  transform: async () => ({code: null}),
  urls: () => ({local: [], network: []}),
  reload: async () => {},
  restart: async (force) => {
    restarts.push(force ?? false)
  },
})

const laterAgent = (version: number) => `export default {
  id: "later",
  async setup(ctx) {
    await ctx.agent.transform((editor) => editor.update("later", () => {}))
    await ctx.tool.transform((editor) => editor.add({ name: "later_v${version}", description: "", input: {}, execute: async () => ({}) }))
  },
}`

describe('a rule pushed onto every agent', () => {
  it.live(
    'server_restart asks an agent that a project plugin adds, also after that plugin reloads',
    () =>
      Effect.gen(function* () {
        const directory = yield* tmpdirScoped()
        const file = path.join(directory.path, 'conciv/plugins/later.ts')
        yield* Effect.promise(async () => {
          await write(file, laterAgent(1))
          await fs.utimes(file, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000))
        })
        const watcher = yield* Watcher.Test
        const bus = yield* Bus.Service
        const locations = yield* LayerMap.make((root: string) => supervisorLayer(root, {bundler}), {
          idleTimeToLive: Duration.infinity,
        })
        yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          const tools = yield* Tool.Service
          const permission = yield* Permission.Service
          const location = yield* Location.Service
          const sessionId = Session.Id.make('conciv_later_agent_test')
          yield* (yield* Sessions.Service).create({
            id: sessionId,
            location: Location.Ref.make({directory: location.directory}),
          })
          const asked = yield* Queue.unbounded<void>()
          const unsubscribe = yield* bus.listen((event) =>
            event.type === Permission.Event.Asked.type
              ? Queue.offer(asked, undefined).pipe(Effect.asVoid)
              : Effect.void,
          )
          yield* Effect.addFinalizer(() => unsubscribe)
          const restartAsLater = (call: string) =>
            Effect.gen(function* () {
              const codeMode = (yield* tools.snapshot()).codeMode
              if (!codeMode) return yield* Effect.die(new Error('code mode is off'))
              const running = yield* codeMode
                .execute(
                  'server_restart',
                  {},
                  {
                    sessionId,
                    agent: Agent.Id.make('later'),
                    messageId: undefined,
                    id: ToolSchema.CallId.make(call),
                    progress: () => Effect.void,
                  },
                )
                .pipe(Effect.forkScoped)
              const first = yield* Effect.raceFirst(
                Queue.take(asked).pipe(Effect.as('asked')),
                Fiber.await(running).pipe(Effect.as('ran without asking')),
              )
              const [request] = yield* permission.forSession(sessionId)
              if (request) yield* permission.reply({requestId: request.id, reply: 'once'})
              yield* Fiber.join(running)
              return first
            })
          restarts.length = 0
          yield* plugins.awaitActivation
          expect(yield* get(tools, 'later_v1')).toBeDefined()
          expect(yield* restartAsLater('call-first-generation')).toBe('asked')
          expect(restarts).toEqual([false])

          yield* Effect.promise(async () => {
            await write(file, laterAgent(2))
            await fs.utimes(file, new Date(), new Date())
          })
          yield* watcher.emit({path: file, type: 'update'})
          yield* get(tools, 'later_v2').pipe(
            Effect.flatMap((tool) => (tool ? Effect.void : Effect.fail('activation pending'))),
            Effect.retry({times: 80, schedule: Schedule.spaced('25 millis')}),
          )
          yield* plugins.awaitActivation
          expect(yield* get(tools, 'later_v1')).toBeUndefined()
          expect(yield* restartAsLater('call-next-generation')).toBe('asked')
          expect(restarts).toEqual([false, false])
        }).pipe(Effect.scoped, Effect.provide(locations.get(directory.path)))
      }),
    30_000,
  )

  it.live(
    'server_restart stays offered and still asks while a later plugin reloads with the call waiting in a before hook',
    () =>
      Effect.gen(function* () {
        const directory = yield* tmpdirScoped()
        const callEntered = yield* Deferred.make<void>()
        const callGate = yield* Deferred.make<void>()
        const reloadEntered = yield* Deferred.make<void>()
        const reloadGate = yield* Deferred.make<void>()
        const sdk = yield* SdkPlugins.Service
        yield* sdk.register(
          define({
            id: 'holds-the-call',
            effect: (ctx) =>
              Effect.gen(function* () {
                yield* ctx.agent.transform((editor) => editor.update('held', () => {}))
                yield* ctx.tool.hook('execute.before', (event) =>
                  event.tool === 'server_restart'
                    ? Deferred.succeed(callEntered, undefined).pipe(Effect.andThen(Deferred.await(callGate)))
                    : Effect.void,
                )
              }),
          }),
        )
        yield* sdk.register(define({id: 'reloaded', effect: () => Effect.void}))
        const bus = yield* Bus.Service
        const locations = yield* LayerMap.make((root: string) => supervisorLayer(root, {bundler}), {
          idleTimeToLive: Duration.infinity,
        })
        yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          const tools = yield* Tool.Service
          const permission = yield* Permission.Service
          const location = yield* Location.Service
          const sessionId = Session.Id.make('conciv_held_call_test')
          yield* (yield* Sessions.Service).create({
            id: sessionId,
            location: Location.Ref.make({directory: location.directory}),
          })
          const asked = yield* Queue.unbounded<void>()
          const unsubscribe = yield* bus.listen((event) =>
            event.type === Permission.Event.Asked.type
              ? Queue.offer(asked, undefined).pipe(Effect.asVoid)
              : Effect.void,
          )
          yield* Effect.addFinalizer(() => unsubscribe)
          const restartTool = Effect.map(
            tools.snapshot(),
            (snapshot) => snapshot.codeMode?.tools.has('server_restart') === true,
          )
          restarts.length = 0
          yield* plugins.awaitActivation
          expect(yield* restartTool).toBe(true)

          const codeMode = (yield* tools.snapshot()).codeMode
          if (!codeMode) return yield* Effect.die(new Error('code mode is off'))
          const running = yield* codeMode
            .execute(
              'server_restart',
              {},
              {
                sessionId,
                agent: Agent.Id.make('held'),
                messageId: undefined,
                id: ToolSchema.CallId.make('call-held-in-before-hook'),
                progress: () => Effect.void,
              },
            )
            .pipe(Effect.forkScoped({startImmediately: true}))
          yield* Deferred.await(callEntered)

          yield* sdk.register(
            define({
              id: 'reloaded',
              effect: () => Deferred.succeed(reloadEntered, undefined).pipe(Effect.andThen(Deferred.await(reloadGate))),
            }),
          )
          yield* Deferred.await(reloadEntered)
          expect(yield* restartTool).toBe(true)
          expect(restarts).toEqual([])

          yield* Deferred.succeed(callGate, undefined)
          const first = yield* Effect.raceFirst(
            Queue.take(asked).pipe(Effect.as('asked')),
            Fiber.await(running).pipe(Effect.as('ran without asking')),
          )
          const restartsAtDecision = [...restarts]
          yield* Deferred.succeed(reloadGate, undefined)
          const [request] = yield* permission.forSession(sessionId)
          if (request) yield* permission.reply({requestId: request.id, reply: 'once'})
          yield* Fiber.join(running)
          yield* plugins.awaitActivation
          expect(yield* restartTool).toBe(true)
          expect({first, restartsAtDecision}).toEqual({first: 'asked', restartsAtDecision: []})
        }).pipe(Effect.scoped, Effect.provide(locations.get(directory.path)))
      }),
    30_000,
  )

  it.live(
    'server_restart still asks when the host closes its plugins while the call waits in a before hook',
    () =>
      Effect.gen(function* () {
        const directory = yield* tmpdirScoped()
        const callEntered = yield* Deferred.make<void>()
        const callGate = yield* Deferred.make<void>()
        const sdk = yield* SdkPlugins.Service
        yield* sdk.register(
          define({
            id: 'holds-the-call',
            effect: (ctx) =>
              Effect.gen(function* () {
                yield* ctx.agent.transform((editor) => editor.update('held', () => {}))
                yield* ctx.tool.hook('execute.before', (event) =>
                  event.tool === 'server_restart'
                    ? Deferred.succeed(callEntered, undefined).pipe(Effect.andThen(Deferred.await(callGate)))
                    : Effect.void,
                )
              }),
          }),
        )
        const bus = yield* Bus.Service
        const locations = yield* LayerMap.make((root: string) => supervisorLayer(root, {bundler}), {
          idleTimeToLive: Duration.infinity,
        })
        yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          const tools = yield* Tool.Service
          const permission = yield* Permission.Service
          const location = yield* Location.Service
          const sessionId = Session.Id.make('conciv_closed_host_call_test')
          yield* (yield* Sessions.Service).create({
            id: sessionId,
            location: Location.Ref.make({directory: location.directory}),
          })
          const asked = yield* Queue.unbounded<void>()
          const unsubscribe = yield* bus.listen((event) =>
            event.type === Permission.Event.Asked.type
              ? Queue.offer(asked, undefined).pipe(Effect.asVoid)
              : Effect.void,
          )
          yield* Effect.addFinalizer(() => unsubscribe)
          const restartTool = Effect.map(
            tools.snapshot(),
            (snapshot) => snapshot.codeMode?.tools.has('server_restart') === true,
          )
          restarts.length = 0
          yield* plugins.awaitActivation
          expect(yield* restartTool).toBe(true)

          const codeMode = (yield* tools.snapshot()).codeMode
          if (!codeMode) return yield* Effect.die(new Error('code mode is off'))
          const running = yield* codeMode
            .execute(
              'server_restart',
              {},
              {
                sessionId,
                agent: Agent.Id.make('held'),
                messageId: undefined,
                id: ToolSchema.CallId.make('call-held-while-the-host-closes'),
                progress: () => Effect.void,
              },
            )
            .pipe(Effect.forkScoped({startImmediately: true}))
          yield* Deferred.await(callEntered)

          yield* plugins.close(Exit.void)
          expect(restarts).toEqual([])

          yield* Deferred.succeed(callGate, undefined)
          const first = yield* Effect.raceFirst(
            Queue.take(asked).pipe(Effect.as('asked')),
            Fiber.await(running).pipe(Effect.as('ran without asking')),
          )
          const restartsAtDecision = [...restarts]
          const [request] = yield* permission.forSession(sessionId)
          if (request) yield* permission.reply({requestId: request.id, reply: 'once'})
          yield* Fiber.join(running)
          expect({first, restartsAtDecision}).toEqual({first: 'asked', restartsAtDecision: []})
        }).pipe(Effect.scoped, Effect.provide(locations.get(directory.path)))
      }),
    30_000,
  )

  it.live(
    "an agent rule a plugin pushes for server_restart beats the tool's own ask, in either direction",
    () =>
      Effect.gen(function* () {
        const directory = yield* tmpdirScoped()
        const sdk = yield* SdkPlugins.Service
        const pushRule = (effect: 'allow' | 'deny') =>
          sdk.register(
            define({
              id: 'user-rules',
              effect: (ctx) =>
                ctx.agent.transform((editor) =>
                  editor
                    .list()
                    .forEach((agent) => agent.permissions.push({action: 'server_restart', resource: '*', effect})),
                ),
            }),
          )
        yield* pushRule('allow')
        const bus = yield* Bus.Service
        const locations = yield* LayerMap.make((root: string) => supervisorLayer(root, {bundler}), {
          idleTimeToLive: Duration.infinity,
        })
        yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          const tools = yield* Tool.Service
          const agents = yield* Agent.Service
          const location = yield* Location.Service
          const sessionId = Session.Id.make('conciv_user_rule_test')
          yield* (yield* Sessions.Service).create({
            id: sessionId,
            location: Location.Ref.make({directory: location.directory}),
          })
          const asked = yield* Queue.unbounded<void>()
          const unsubscribe = yield* bus.listen((event) =>
            event.type === Permission.Event.Asked.type
              ? Queue.offer(asked, undefined).pipe(Effect.asVoid)
              : Effect.void,
          )
          yield* Effect.addFinalizer(() => unsubscribe)
          const restartAsBuild = (call: string) =>
            Effect.gen(function* () {
              const codeMode = (yield* tools.snapshot()).codeMode
              if (!codeMode) return yield* Effect.die(new Error('code mode is off'))
              const running = yield* codeMode
                .execute(
                  'server_restart',
                  {},
                  {
                    sessionId,
                    agent: Agent.defaultId,
                    messageId: undefined,
                    id: ToolSchema.CallId.make(call),
                    progress: () => Effect.void,
                  },
                )
                .pipe(Effect.forkScoped)
              return yield* Effect.raceFirst(
                Queue.take(asked).pipe(Effect.as('asked')),
                Fiber.await(running).pipe(Effect.map((exit) => (Exit.isSuccess(exit) ? 'ran' : 'refused'))),
              )
            })
          restarts.length = 0
          yield* plugins.awaitActivation
          expect(yield* restartAsBuild('call-allowed')).toBe('ran')
          expect(restarts).toEqual([false])

          yield* pushRule('deny')
          yield* agents.get(Agent.defaultId).pipe(
            Effect.flatMap((agent) =>
              agent?.permissions.at(-1)?.effect === 'deny' ? Effect.void : Effect.fail('activation pending'),
            ),
            Effect.retry({times: 80, schedule: Schedule.spaced('25 millis')}),
          )
          yield* plugins.awaitActivation
          expect(yield* restartAsBuild('call-denied')).toBe('refused')
          expect(restarts).toEqual([false])
        }).pipe(Effect.scoped, Effect.provide(locations.get(directory.path)))
      }),
    30_000,
  )
})

const LoadWarning = z.tuple([
  z.literal('failed to load plugin'),
  z.object({target: z.string(), ref: z.string(), cause: z.custom<Cause.Cause<unknown>>(Cause.isCause)}),
])

describe('PluginSupervisor load failure', () => {
  it.live(
    "a local plugin with an enum fails to load: the list shows the generic error, the log entry with its reference carries Node's reason",
    () => {
      const warnings: Array<z.infer<typeof LoadWarning>[1]> = []
      const logger = Logger.make((entry) => {
        const warning = LoadWarning.safeParse(entry.message)
        if (warning.success) warnings.push(warning.data[1])
      })
      return Effect.gen(function* () {
        const directory = yield* tmpdirScoped()
        const file = path.join(directory.path, 'conciv/plugins/greeter.ts')
        yield* Effect.promise(() =>
          write(file, 'enum Mode { Ready = "ready" }\nexport default { id: Mode.Ready, async setup() {} }'),
        )
        const locations = yield* instances()
        yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          yield* plugins.awaitActivation
          const failure = yield* failed(plugins)
          expect(failure).toEqual({
            source: {type: 'local', path: file},
            state: {status: 'failed', error: 'Plugin failed to load', ref: expect.stringMatching(/^err_[0-9a-f]{8}$/)},
            features: {server: true},
          })
          const ref = failure.state.status === 'failed' ? failure.state.ref : undefined
          const logged = warnings.find((warning) => warning.ref === ref)
          expect(logged?.target).toBe(file)
          expect(String(logged && Cause.squash(logged.cause))).toContain(
            'TypeScript enum is not supported in strip-only mode',
          )
        }).pipe(Effect.scoped, Effect.provide(locations.get(directory.path)))
      }).pipe(Effect.provide(Logger.layer([logger])))
    },
    30_000,
  )
})
