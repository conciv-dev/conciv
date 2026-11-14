import {expect} from 'vitest'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {Deferred, Effect, Fiber, Logger, Schema, Stream} from 'effect'
import {Tool as PluginTool} from '@conciv/plugin'
import {Agent} from '../../src/core/agent.js'
import {Bus} from '../../src/core/bus.js'
import {Watcher} from '../../src/core/filesystem/watcher.js'
import {Plugin} from '../../src/core/plugin.js'
import {PluginHost} from '../../src/core/plugin/host.js'
import {PluginModule} from '../../src/core/plugin/module.js'
import {Rpc} from '../../src/core/rpc.js'
import {Session} from '../../src/core/session.js'
import {Tool} from '../../src/core/tool.js'
import {fromPromise} from '../../src/plugin/promise/adapter.js'
import {Session as SessionSchema} from '../../src/schema/session.js'
import {testEffect} from './lib/effect'
import {PluginTestLayer} from './plugin/fixture'

const it = testEffect(PluginTestLayer)

const get = (tools: Tool.Interface, name: string) =>
  tools.list().pipe(Effect.map((list) => list.find((tool) => tool.name === name)))

for (const scenario of [
  {
    name: 'starts only the appended plugin',
    before: ['a', 'b'],
    after: ['a', 'b', 'c'],
    expected: ['start:c:1'],
  },
  {
    name: 'restarts the suffix after an insertion',
    before: ['a', 'b', 'c'],
    after: ['a', 'x', 'b', 'c'],
    expected: ['stop:c:1', 'stop:b:1', 'start:x:1', 'start:b:1', 'start:c:1'],
  },
  {
    name: 'restarts the suffix after a revision changes',
    before: ['a', 'b', 'c'],
    after: ['a', 'b', 'c'],
    updated: 'b',
    expected: ['stop:c:1', 'stop:b:1', 'start:b:2', 'start:c:1'],
  },
  {
    name: 'stops only the removed trailing plugin',
    before: ['a', 'b', 'c'],
    after: ['a', 'b'],
    expected: ['stop:c:1'],
  },
]) {
  it.effect(scenario.name, () =>
    Effect.gen(function* () {
      const plugins = yield* Plugin.Service
      const events: string[] = []
      const plugin = (id: string, revision = '1'): Plugin.Generation => ({
        id,
        revision,
        effect: () =>
          Effect.gen(function* () {
            events.push(`start:${id}:${revision}`)
            yield* Effect.addFinalizer(() => Effect.sync(() => events.push(`stop:${id}:${revision}`)))
          }),
      })

      yield* plugins.activate(scenario.before.map((id) => plugin(id)))
      events.length = 0
      yield* plugins.activate(scenario.after.map((id) => plugin(id, id === scenario.updated ? '2' : '1')))

      expect(events).toEqual(scenario.expected)
      expect((yield* plugins.list()).map((plugin) => plugin.id)).toEqual(scenario.after.map((id) => Plugin.Id.make(id)))
    }),
  )
}

it.effect('updates inventory metadata without restarting an unchanged generation', () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    let loads = 0
    const plugin = {
      id: 'metadata',
      revision: '1',
      source: {type: 'package' as const, target: 'fixture'},
      effect: () => Effect.sync(() => loads++),
    }

    yield* plugins.activate([plugin])
    yield* plugins.activate([{...plugin, source: {...plugin.source, outdated: true}}])

    expect(loads).toBe(1)
    expect((yield* plugins.list())[0]?.source).toEqual({type: 'package', target: 'fixture', outdated: true})
  }),
)

it.live('loads a local plugin with its configured options', () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const tools = yield* Tool.Service
    yield* plugins.awaitActivation
    const modules = yield* PluginModule.make().pipe(Effect.provide(Watcher.testLayer))
    const definition = yield* modules.load({
      type: 'add',
      target: path.join(import.meta.dirname, 'plugin/fixtures/greeting.ts'),
      options: {description: 'Configured greeting'},
    })
    if ('pending' in definition || 'blocked' in definition) return yield* Effect.die('Local plugin was not loaded')
    yield* plugins.activate([definition])

    expect(yield* get(tools, 'greet')).toMatchObject({description: 'Configured greeting'})
  }),
)

it.live("serves a local plugin's experimental bundle, and reloads it alone when only the bundle changes", () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const bus = yield* Bus.Service
    yield* plugins.awaitActivation
    const directory = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(path.join(tmpdir(), 'opencode-plugin-experimental-'))),
      (directory) => Effect.promise(() => rm(directory, {recursive: true, force: true})),
    )
    const starts = path.join(directory, 'starts')
    const bundle = 'module.exports = { default: function setup() {}, main: function main() {} }'
    yield* Effect.promise(async () => {
      await writeFile(
        path.join(directory, 'index.ts'),
        `import { appendFileSync } from "node:fs"\nexport default { id: "fixture.experimental", setup() { appendFileSync(${JSON.stringify(starts)}, "x") } }`,
      )
      await writeFile(path.join(directory, 'plugin-experimental.js'), bundle)
    })
    const updates: string[] = []
    yield* Effect.acquireRelease(
      bus.listen((event) =>
        Effect.sync(() => void (event.type === Plugin.Event.Updated.type && updates.push(event.type))),
      ),
      (unsubscribe) => unsubscribe,
    )
    const modules = yield* PluginModule.make().pipe(Effect.provide(Watcher.testLayer))
    const load = Effect.gen(function* () {
      const definition = yield* modules.load({type: 'add', target: directory, options: {token: 'secret'}})
      if ('pending' in definition || 'blocked' in definition) return yield* Effect.die('Local plugin was not loaded')
      return definition
    })
    const first = yield* load
    yield* plugins.activate([first])
    const id = Plugin.Id.make('fixture.experimental')

    expect((yield* plugins.list()).find((plugin) => plugin.id === id)?.features).toEqual({
      server: true,
      experimental: true,
    })
    const served = yield* plugins.experimental(id)
    expect(served?.code).toBe(bundle)
    expect(served?.options).toEqual({token: 'secret'})
    expect(served?.revision).toMatch(/^[0-9a-f]{64}$/)
    expect(yield* plugins.experimental(Plugin.Id.make('missing'))).toBeUndefined()

    yield* Effect.promise(() => writeFile(path.join(directory, 'plugin-experimental.js'), `${bundle}\n// edited`))
    const edited = yield* load
    const published = updates.length
    yield* plugins.activate([edited])

    expect(edited.revision).toBe(first.revision)
    expect((yield* plugins.experimental(id))?.revision).not.toBe(served?.revision)
    expect(updates.length).toBe(published + 1)
    expect(yield* Effect.promise(() => readFile(starts, 'utf8'))).toBe('x')
  }).pipe(Effect.scoped),
)
it.effect('unloading a plugin removes its tools and runs cleanup', () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const tools = yield* Tool.Service
    let cleaned = false
    yield* plugins.activate([
      {
        id: 'greeting',
        revision: '1',
        effect: (ctx) =>
          Effect.gen(function* () {
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                cleaned = true
              }),
            )
            yield* ctx.tool.transform((editor) =>
              editor.add({name: 'greet', description: '', input: {}, execute: () => Effect.succeed({})}),
            )
          }),
      },
    ])
    expect(yield* get(tools, 'greet')).toBeDefined()
    expect(cleaned).toBe(false)

    yield* plugins.activate([])

    expect(yield* get(tools, 'greet')).toBeUndefined()
    expect(cleaned).toBe(true)
  }),
)

it.effect('reports a failed plugin without blocking a healthy plugin', () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const tools = yield* Tool.Service
    yield* plugins.activate([
      {id: 'broken', revision: '1', effect: () => Effect.die(new Error('Setup failed'))},
      {
        id: 'greeting',
        revision: '1',
        effect: (ctx) =>
          ctx.tool
            .transform((editor) =>
              editor.add({name: 'greet', description: '', input: {}, execute: () => Effect.succeed({})}),
            )
            .pipe(Effect.asVoid),
      },
    ])

    expect((yield* plugins.list()).find((plugin) => plugin.id === 'broken')?.state).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('Setup failed'),
    })
    expect(yield* get(tools, 'greet')).toBeDefined()
  }),
)

it.effect('disables a plugin whose transform fails after setup without publishing its partial edits', () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const tools = yield* Tool.Service
    let cleaned = false
    yield* plugins.activate([
      {
        id: 'before',
        revision: '1',
        effect: (ctx) =>
          ctx.tool
            .transform((editor) =>
              editor.add({name: 'shared', description: 'original', input: {}, execute: () => Effect.succeed({})}),
            )
            .pipe(Effect.asVoid),
      },
      {
        id: 'broken',
        revision: '1',
        effect: (ctx) =>
          Effect.gen(function* () {
            yield* Effect.addFinalizer(() => Effect.sync(() => void (cleaned = true)))
            yield* ctx.tool.transform((editor) => {
              editor.add({name: 'shared', description: 'partial', input: {}, execute: () => Effect.succeed({})})
              throw new Error('replay failed')
            })
          }),
      },
      {
        id: 'after',
        revision: '1',
        effect: (ctx) =>
          ctx.tool
            .transform((editor) =>
              editor.add({name: 'healthy', description: '', input: {}, execute: () => Effect.succeed({})}),
            )
            .pipe(Effect.asVoid),
      },
    ])

    yield* plugins.awaitActivation
    expect(cleaned).toBe(true)
    expect((yield* plugins.list()).find((plugin) => plugin.id === 'broken')?.state).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('tool.transform failed'),
      ref: expect.stringMatching(/^err_/),
    })
    expect(yield* get(tools, 'shared')).toMatchObject({description: 'original'})
    expect(yield* get(tools, 'healthy')).toBeDefined()
  }),
)

it.effect('keeps the suffix after a failed plugin alive across identical activations', () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const setups = {good1: 0, broken: 0, good2: 0}
    const good = (id: 'good1' | 'good2'): Plugin.Generation => ({
      id,
      revision: '1',
      effect: () => Effect.sync(() => void setups[id]++),
    })
    const broken = (revision: string): Plugin.Generation => ({
      id: 'broken',
      revision,
      effect: () =>
        Effect.suspend(() => {
          setups.broken++
          return Effect.die(new Error('Setup failed'))
        }),
    })
    const failed = () =>
      plugins.list().pipe(Effect.map((inventory) => inventory.find((plugin) => plugin.id === 'broken')?.state))

    yield* plugins.activate([good('good1'), broken('1'), good('good2')])
    expect(setups).toEqual({good1: 1, broken: 1, good2: 1})
    expect(yield* failed()).toMatchObject({status: 'failed', error: expect.stringContaining('Setup failed')})

    yield* plugins.activate([good('good1'), broken('1'), good('good2')])
    expect(setups).toEqual({good1: 1, broken: 1, good2: 1})
    expect(yield* failed()).toMatchObject({status: 'failed', error: expect.stringContaining('Setup failed')})
    expect((yield* plugins.list()).map((plugin) => `${plugin.id}:${plugin.state.status}`)).toEqual([
      'good1:active',
      'broken:failed',
      'good2:active',
    ])

    yield* plugins.activate([good('good1'), broken('2'), good('good2')])
    expect(setups).toEqual({good1: 1, broken: 2, good2: 2})
    expect(yield* failed()).toMatchObject({status: 'failed'})
  }),
)

it.effect('attributes replay failure to the broken plugin rather than a later plugin reading the registry', () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const tools = yield* Tool.Service
    yield* plugins.activate([
      {
        id: 'broken-plugin',
        revision: '1',
        effect: (ctx) =>
          ctx.tool
            .transform(() => {
              throw new Error('plugin failed')
            })
            .pipe(Effect.asVoid),
      },
      {
        id: 'reader',
        revision: '1',
        effect: (ctx) =>
          Effect.gen(function* () {
            yield* ctx.tool.list().pipe(Effect.orDie)
            yield* ctx.tool.transform((editor) =>
              editor.add({name: 'reader', description: '', input: {}, execute: () => Effect.succeed({})}),
            )
          }),
      },
    ])
    yield* plugins.awaitActivation
    expect((yield* plugins.list()).map((entry) => `${entry.id}:${entry.state.status}`)).toEqual([
      'broken-plugin:failed',
      'reader:active',
    ])
    expect(yield* get(tools, 'reader')).toBeDefined()
  }),
)

it.effect('disables plugins after runtime reload failures without retrying an unchanged generation', () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const tools = yield* Tool.Service
    const bus = yield* Bus.Service
    const reported: string[] = []
    yield* Effect.acquireRelease(
      bus.listen((event) =>
        event.type === Plugin.Event.Updated.type
          ? plugins.list().pipe(
              Effect.tap((items) => Effect.sync(() => void reported.push(items[0]?.state.status ?? 'empty'))),
              Effect.asVoid,
            )
          : Effect.void,
      ),
      (unsubscribe) => unsubscribe,
    )
    let fail = false
    let loads = 0
    let reload = () => Effect.void
    const generation = (revision: string): Plugin.Generation => ({
      id: 'runtime',
      revision,
      effect: (ctx) =>
        Effect.gen(function* () {
          loads++
          reload = ctx.tool.reload
          yield* ctx.tool.transform((editor) => {
            editor.add({name: 'runtime', description: '', input: {}, execute: () => Effect.succeed({})})
            if (fail) throw new Error('private failure detail')
          })
        }),
    })
    const discovery = {
      source: {type: 'local' as const, path: '/missing'},
      state: {status: 'failed' as const, error: 'Import failed'},
      features: {server: true},
    } satisfies Plugin.Info
    yield* plugins.activate([generation('1')], [discovery])
    expect(yield* get(tools, 'runtime')).toBeDefined()
    fail = true
    yield* reload()
    yield* plugins.awaitActivation
    const inventory = yield* plugins.list()
    expect(inventory[0]?.state).toMatchObject({status: 'failed', ref: expect.stringMatching(/^err_/)})
    expect(JSON.stringify(inventory[0]?.state)).not.toContain('private failure detail')
    expect(reported.at(-1)).toBe('failed')
    expect(inventory[1]).toEqual(discovery)
    expect(yield* get(tools, 'runtime')).toBeUndefined()

    fail = false
    yield* plugins.activate([generation('1')], [discovery])
    expect(loads).toBe(1)
    expect(yield* get(tools, 'runtime')).toBeUndefined()
    yield* plugins.activate([generation('2')], [discovery])
    expect(loads).toBe(2)
    expect((yield* plugins.list())[0]?.state).toEqual({status: 'active'})
    expect(yield* get(tools, 'runtime')).toBeDefined()
  }),
)

it.effect('disables plugins after replay failures discovered during setup without restoring the old generation', () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const tools = yield* Tool.Service
    const cleaned = yield* Deferred.make<void>()
    const loads: string[] = []
    const generation = (revision: string): Plugin.Generation => ({
      id: 'replacement',
      revision,
      effect: (ctx) =>
        Effect.gen(function* () {
          loads.push(revision)
          if (revision === '2')
            yield* Effect.addFinalizer(() =>
              plugins.awaitActivation.pipe(Effect.andThen(Deferred.succeed(cleaned, undefined))),
            )
          yield* ctx.tool.transform((editor) => {
            editor.add({name: 'replacement', description: '', input: {}, execute: () => Effect.succeed({})})
            if (revision === '2') throw new Error('replay failure')
          })
          if (revision === '2') {
            yield* ctx.tool.list().pipe(Effect.orDie)
            yield* Effect.die('subsequent setup failure')
          }
        }),
    })
    yield* plugins.activate([generation('1')])
    yield* plugins.activate([generation('2')])
    yield* plugins.awaitActivation
    yield* Deferred.await(cleaned)
    expect(loads).toEqual(['1', '2'])
    expect((yield* plugins.list())[0]?.state).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('tool.transform'),
    })
    expect(yield* get(tools, 'replacement')).toBeUndefined()
  }),
)

it.effect('does not let asynchronous plugin cleanup block recovered registry readiness', () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const tools = yield* Tool.Service
    const cleaned = yield* Deferred.make<void>()
    yield* plugins.activate([
      {
        id: 'async-cleanup',
        revision: '1',
        effect: (ctx) =>
          Effect.gen(function* () {
            yield* ctx.tool.transform(() => {
              throw new Error('failed')
            })
            yield* Effect.addFinalizer(() =>
              plugins.awaitActivation.pipe(Effect.andThen(Deferred.succeed(cleaned, undefined))),
            )
          }),
      },
      {
        id: 'healthy',
        revision: '1',
        effect: (ctx) =>
          ctx.tool
            .transform((editor) =>
              editor.add({name: 'healthy', description: '', input: {}, execute: () => Effect.succeed({})}),
            )
            .pipe(Effect.asVoid),
      },
    ])
    yield* plugins.awaitActivation
    yield* Deferred.await(cleaned)
    expect(yield* get(tools, 'healthy')).toBeDefined()
    expect((yield* plugins.list())[0]?.state.status).toBe('failed')
  }),
)

it.live("retains Promise plugin groups for later registrations and ignores a disabled group's attempts", () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const tools = yield* Tool.Service
    let register = async () => {}
    const definition = fromPromise({
      id: 'promise-plugin',
      setup(ctx) {
        register = async () => {
          await ctx.tool.transform((editor) => {
            editor.add({name: 'late', description: '', input: {}, execute: async () => ({})})
            throw new Error('late Promise failure')
          })
        }
      },
    })
    yield* plugins.activate([{...definition, revision: '1'}])
    yield* Effect.promise(register)
    yield* plugins.awaitActivation
    expect((yield* plugins.list())[0]?.state).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('tool.transform'),
    })
    expect(yield* get(tools, 'late')).toBeUndefined()
    yield* Effect.promise(register)
    expect(yield* get(tools, 'late')).toBeUndefined()
  }),
)

it.effect('normalizes Promise plugin API inputs through JSON', () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const sessions = yield* Session.Service
    const created: boolean[] = []
    const refused: unknown[] = []
    yield* plugins.activate([
      {
        ...fromPromise({
          id: 'promise-input',
          async setup(ctx) {
            await ctx.session.create({title: 'Promise session', agent: undefined})
            created.push(true)
            refused.push(
              await ctx.session.create({id: 'conciv_has.dot'}).then(
                () => 'created',
                (error) => error,
              ),
            )
            await ctx.session.create({id: 'conciv_promise_input', title: 'Supplied', metadata: {ticket: 7}})
          },
        }),
        revision: '1',
      },
    ])
    yield* plugins.awaitActivation

    expect(created).toEqual([true])
    expect(refused).toEqual([
      expect.objectContaining({name: 'SchemaError', message: expect.stringContaining('["id"]')}),
    ])
    expect(yield* sessions.get(SessionSchema.Id.make('conciv_promise_input'))).toMatchObject({
      id: 'conciv_promise_input',
      title: 'Supplied',
      metadata: {ticket: 7},
    })
  }),
)

it.effect("a Promise plugin tool's toolError reaches the host as a Tool.Error with its message and metadata", () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const tools = yield* Tool.Service
    yield* plugins.activate([
      {
        ...fromPromise({
          id: 'promise-failure',
          async setup(ctx) {
            await ctx.tool.transform((editor) => {
              editor.add({
                name: 'promise_fail',
                description: 'Fails with metadata.',
                input: {type: 'object', properties: {}},
                execute: async () => {
                  throw PluginTool.toolError({message: 'the probe broke', metadata: {code: 'X_CODE'}})
                },
              })
            })
          },
        }),
        revision: '1',
      },
    ])
    yield* plugins.awaitActivation
    const tool = yield* get(tools, 'promise_fail')
    if (!tool) return yield* Effect.die('promise_fail is not registered')
    const failure = yield* tool
      .execute(
        {},
        {
          sessionId: SessionSchema.Id.make('conciv_plugin'),
          agent: Agent.Id.make('build'),
          messageId: undefined,
          id: Tool.CallId.make('call_promise_fail'),
          progress: () => Effect.void,
        },
      )
      .pipe(Effect.flip)

    expect(failure).toMatchObject({_tag: 'Tool.Error', message: 'the probe broke', metadata: {code: 'X_CODE'}})
  }),
)

it.effect("creates child sessions from a plugin at the parent's location", () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const sessions = yield* Session.Service
    const created = yield* Deferred.make<{parentId: SessionSchema.Id; childId: SessionSchema.Id}>()
    yield* plugins.activate([
      {
        id: 'child-session',
        revision: '1',
        effect: (ctx) =>
          Effect.gen(function* () {
            const parent = yield* ctx.session.create({title: 'Parent', metadata: {source: 'parent'}}).pipe(Effect.orDie)
            const child = yield* ctx.session.create({parentId: parent.id, title: 'Child'}).pipe(Effect.orDie)
            yield* Deferred.succeed(created, {parentId: parent.id, childId: child.id})
          }),
      },
    ])
    yield* plugins.awaitActivation
    const ids = yield* Deferred.await(created)
    const parent = yield* sessions.get(ids.parentId)
    const child = yield* sessions.get(ids.childId)

    expect(child).toMatchObject({parentId: parent.id, location: parent.location, metadata: parent.metadata})
  }),
)

it.effect('reloading a plugin replaces its tool implementation', () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const tools = yield* Tool.Service
    const output: string[] = []
    const load = (revision: string, text: string) =>
      plugins.activate([
        {
          id: 'greeting',
          revision,
          effect: (ctx) =>
            ctx.tool
              .transform((editor) =>
                editor.add({
                  name: 'greet',
                  description: '',
                  input: {},
                  execute: () =>
                    Effect.sync(() => {
                      output.push(text)
                      return {}
                    }),
                }),
              )
              .pipe(Effect.asVoid),
        },
      ])
    const request = {
      sessionId: SessionSchema.Id.make('conciv_plugin'),
      agent: Agent.Id.make('build'),
      messageId: undefined,
      id: Tool.CallId.make('call_plugin'),
      progress: () => Effect.void,
    }
    const execute = Effect.gen(function* () {
      const tool = yield* get(tools, 'greet')
      if (!tool) return yield* Effect.die('greet is not registered')
      yield* tool.execute({}, request)
    })

    yield* load('1', 'before')
    yield* execute
    expect(output).toEqual(['before'])

    yield* load('2', 'after')
    yield* execute
    expect(output).toEqual(['before', 'after'])
  }),
)

it.effect('host event subscriptions deliver requested rpc types and ignore unknown types', () =>
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const host = yield* PluginHost.make(yield* Plugin.Service, 'test')
    const fiber = yield* host.event
      // @ts-expect-error untyped JavaScript plugins can still pass unknown type names
      .subscribe({types: ['rpc.test.ping', 'test.unknown']})
      .pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped({startImmediately: true}))

    yield* bus.publish(Plugin.Event.Updated, {})
    yield* bus.publish(Rpc.eventDefinition('rpc.test.ping'), {value: 1})

    expect(Array.from(yield* Fiber.join(fiber)).map((event) => [event.type, event.data])).toEqual([
      ['rpc.test.ping', {value: 1}],
    ])

    const definition = (id: string) =>
      Rpc.define({id, methods: {ping: {input: Schema.Undefined, output: Schema.String}}, events: {}})
    const mounted = definition('page')
    const plugins = yield* Plugin.Service
    const pluginHost = (pluginId: string) =>
      PluginHost.make(plugins, pluginId).pipe(Effect.provideService(PluginHost.ExtensionSlugs, ['page']))
    const first = yield* pluginHost('first')
    const second = yield* pluginHost('second')
    const refusal = (context: typeof first) =>
      context.rpc.register(mounted, {ping: () => Effect.succeed('mounted')}).pipe(Effect.flip)
    expect(yield* refusal(first)).toEqual(
      new Error('Plugin first cannot register RPC page: the extension page is mounted'),
    )
    expect(yield* refusal(second)).toEqual(
      new Error('Plugin second cannot register RPC page: the extension page is mounted'),
    )

    yield* first.rpc.register(definition('first-echo'), {ping: () => Effect.succeed('from first')})
    yield* second.rpc.register(definition('second-echo'), {ping: () => Effect.succeed('from second')})
    expect(yield* first.rpc(definition('second-echo')).ping(undefined)).toBe('from second')
    expect(yield* second.rpc(definition('first-echo')).ping(undefined)).toBe('from first')
  }),
)

it.effect('unknown event type warnings name the subscribing plugin', () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const warnings: unknown[] = []
    yield* plugins.activate([
      {
        id: 'probe',
        revision: '1',
        effect: (ctx) =>
          ctx.event
            // @ts-expect-error untyped JavaScript plugins can still pass unknown type names
            .subscribe({types: ['test.unknown']})
            .pipe(
              Stream.runDrain,
              Effect.forkScoped({startImmediately: true}),
              Effect.provide(
                Logger.layer([
                  Logger.make((entry) => {
                    if (entry.logLevel === 'Warn') warnings.push(entry.message)
                  }),
                ]),
              ),
            ),
      },
    ])

    expect(warnings).toEqual([['ignoring unknown event types', {pluginId: 'probe', types: ['test.unknown']}]])
  }),
)
