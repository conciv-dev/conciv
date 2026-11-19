import {describe, expect} from 'vitest'
import {Effect, Fiber, Queue} from 'effect'
import * as Bundler from '@conciv/plugin/schema/bundler'
import {Agent} from '../../src/core/agent.js'
import {Location} from '../../src/core/location.js'
import {Bus} from '../../src/core/bus.js'
import {Permission} from '../../src/core/permission.js'
import {Plugin} from '../../src/core/plugin.js'
import {PluginHost} from '../../src/core/plugin/host.js'
import {Rpc} from '../../src/core/rpc.js'
import {Session as Sessions} from '../../src/core/session.js'
import {Tool} from '../../src/core/tool.js'
import {definition} from '../../src/core/tool/runtime.js'
import {ServerTools} from '../../src/core/tool/plugin/server.js'
import {Tool as ToolSchema} from '@conciv/plugin/schema/tool'
import {Session} from '@conciv/plugin/schema/session'
import {testEffect} from './lib/effect'
import {PluginTestLayer} from './plugin/fixture'

const it = testEffect(PluginTestLayer)

const sessionId = Session.Id.make('conciv_server_tool_test')

const restarts: boolean[] = []

const opened: Array<{file: string; line?: number; column?: number}> = []

const openInEditor = (file: string, line?: number, column?: number) => {
  opened.push({file, ...(line === undefined ? {} : {line}), ...(column === undefined ? {} : {column})})
}

const bridge = Bundler.defineBundlerBridge({
  id: 'server-tool-test',
  config: () => ({
    root: '/repo',
    base: '/app/',
    mode: 'development',
    aliases: [{find: '@', replacement: '/repo/src'}],
    plugins: ['vite:react'],
  }),
  resolve: async (spec, importer) => ({id: spec === 'missing' ? null : `/repo/src/${spec}${importer ? '?from' : ''}`}),
  moduleGraph: (file) => [{url: file, importers: ['/src/main.ts'], importedModules: ['/src/dep.ts']}],
  transform: async (url) => {
    if (url === '/src/broken.ts') throw new Error('transform failed for /src/broken.ts')
    return {code: url === '/src/gone.ts' ? null : `export const served = ${JSON.stringify(url)}`}
  },
  urls: () => ({local: ['http://localhost:5173/'], network: ['http://192.168.1.2:5173/']}),
  reload: async () => {},
  restart: async (force) => {
    restarts.push(force ?? false)
  },
})

const activate = (bundler: typeof bridge | undefined) =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const context = yield* PluginHost.make(plugins, ServerTools.Plugin.id)
    yield* ServerTools.Plugin.effect(context).pipe(
      Effect.provideService(PluginHost.BundlerSource, bundler),
      Effect.provideService(PluginHost.EditorSource, openInEditor),
    )
    const snapshot = yield* (yield* Tool.Service).snapshot()
    const rpc = yield* Rpc.Service
    const call = (name: string, input: unknown) =>
      Effect.suspend(() => {
        const codeMode = snapshot.codeMode
        if (!codeMode) return Effect.die(new Error('code mode is off'))
        return codeMode.execute(name, input, {
          sessionId,
          agent: Agent.Id.make('build'),
          messageId: undefined,
          id: ToolSchema.CallId.make(`call-${name}`),
          progress: () => Effect.void,
        })
      })
    const method = (name: string, input?: unknown) => rpc.call('server', name, input)
    return {snapshot, call, method}
  })

describe('ServerTools', () => {
  it.effect('answers each server tool and its terminal method from one bundler, and fails both without one', () =>
    Effect.gen(function* () {
      const served = yield* activate(bridge)
      expect(Array.from(served.snapshot.codeMode?.tools.keys() ?? [])).toEqual([
        'server_config',
        'server_urls',
        'server_resolve',
        'server_graph',
        'server_transform',
        'server_restart',
        'open',
      ])
      expect(served.snapshot.codeMode?.namespaces.get('server')).toMatchObject({name: 'server'})
      const described = Array.from(served.snapshot.codeMode?.tools ?? []).flatMap(([name, tool]) =>
        Object.entries(definition(tool).inputSchema.properties ?? {})
          .filter(([, field]) => typeof field === 'object' && field !== null && 'description' in field)
          .map(([field]) => `${name}.${field}`),
      )
      expect(described).toEqual([
        'server_resolve.spec',
        'server_resolve.importer',
        'server_graph.file',
        'server_transform.url',
        'server_restart.force',
        'open.file',
        'open.line',
        'open.column',
      ])

      const config = yield* served.call('server_config', {})
      expect(config).toMatchObject({output: bridge.config()})
      expect(yield* served.method('config')).toEqual(config.output)

      const urls = yield* served.call('server_urls', {})
      expect(urls).toMatchObject({output: bridge.urls()})
      expect(yield* served.method('urls')).toEqual(urls.output)

      const resolved = yield* served.call('server_resolve', {spec: 'app.ts', importer: '/repo/src/main.ts'})
      expect(resolved).toMatchObject({output: {id: '/repo/src/app.ts?from'}})
      expect(yield* served.method('resolve', {spec: 'app.ts', importer: '/repo/src/main.ts'})).toEqual(resolved.output)
      expect(yield* served.call('server_resolve', {spec: 'missing'})).toMatchObject({output: {id: null}})
      expect(yield* served.method('resolve', {spec: 'app.ts'})).toEqual({id: '/repo/src/app.ts'})

      const graph = yield* served.call('server_graph', {file: '/src/app.ts'})
      expect(graph).toMatchObject({output: bridge.moduleGraph('/src/app.ts')})
      expect(yield* served.method('graph', {file: '/src/app.ts'})).toEqual(graph.output)

      const transformed = yield* served.call('server_transform', {url: '/src/app.ts'})
      expect(transformed).toMatchObject({output: {code: 'export const served = "/src/app.ts"'}})
      expect(yield* served.method('transform', {url: '/src/app.ts'})).toEqual(transformed.output)
      expect(yield* served.call('server_transform', {url: '/src/gone.ts'})).toMatchObject({output: {code: null}})

      const broken = yield* served.call('server_transform', {url: '/src/broken.ts'}).pipe(Effect.flip)
      expect(broken).toMatchObject({message: 'Unable to transform /src/broken.ts'})
      expect(broken.error).toMatchObject({message: 'transform failed for /src/broken.ts'})
      expect(yield* served.method('transform', {url: '/src/broken.ts'}).pipe(Effect.flip)).toEqual({
        type: 'BUNDLER_FAILED',
        message: 'Unable to transform /src/broken.ts',
        data: {message: 'transform failed for /src/broken.ts'},
      })

      opened.length = 0
      expect(yield* served.call('open', {file: 'src/thing.ts', line: 7})).toMatchObject({
        output: {ok: true, file: 'src/thing.ts', line: 7},
      })
      expect(yield* served.method('open', {file: 'src/thing.ts', line: 7, column: 3})).toEqual({
        ok: true,
        file: 'src/thing.ts',
        line: 7,
      })
      expect(yield* served.call('open', {file: 'src/other.ts', column: 3})).toMatchObject({
        output: {ok: true, file: 'src/other.ts'},
      })
      expect(opened).toEqual([
        {file: 'src/thing.ts', line: 7},
        {file: 'src/thing.ts', line: 7, column: 3},
        {file: 'src/other.ts'},
      ])
      expect(yield* served.call('open', {file: ''}).pipe(Effect.flip)).toMatchObject({_tag: 'Tool.Error'})
      expect(yield* served.method('open', {file: ''}).pipe(Effect.flip)).toMatchObject({type: 'rpc.invalid_input'})
      expect(yield* served.call('open', {file: 'src/thing.ts', line: '7'}).pipe(Effect.flip)).toMatchObject({
        _tag: 'Tool.Error',
      })
      expect(yield* served.method('open', {file: 'src/thing.ts', line: '7'}).pipe(Effect.flip)).toMatchObject({
        type: 'rpc.invalid_input',
      })
      expect(opened).toHaveLength(3)
    }),
  )

  it.effect('server_restart asks before it restarts, and the server plugin has no restart method to skip the ask', () =>
    Effect.gen(function* () {
      const location = yield* Location.Service
      yield* (yield* Sessions.Service).create({
        id: sessionId,
        location: Location.Ref.make({directory: location.directory}),
      })
      const served = yield* activate(bridge)
      const permission = yield* Permission.Service
      const asked = yield* Queue.unbounded<void>()
      const unsubscribe = yield* (yield* Bus.Service).listen((event) =>
        event.type === Permission.Event.Asked.type ? Queue.offer(asked, undefined).pipe(Effect.asVoid) : Effect.void,
      )
      yield* Effect.addFinalizer(() => unsubscribe)
      restarts.length = 0

      const approved = yield* served.call('server_restart', {force: true}).pipe(Effect.forkScoped)
      yield* Queue.take(asked)
      const [request] = yield* permission.forSession(sessionId)
      expect(request).toMatchObject({action: 'server_restart', resources: [bridge.id], save: [bridge.id]})
      expect(restarts).toEqual([])
      yield* permission.reply({requestId: request?.id ?? Permission.Id.create(), reply: 'once'})
      expect(yield* Fiber.join(approved)).toMatchObject({output: {ok: true}})
      expect(restarts).toEqual([true])

      const refused = yield* served.call('server_restart', {}).pipe(Effect.flip, Effect.forkScoped)
      yield* Queue.take(asked)
      const [second] = yield* permission.forSession(sessionId)
      yield* permission.reply({requestId: second?.id ?? Permission.Id.create(), reply: 'reject', message: 'not now'})
      expect(yield* Fiber.join(refused)).toMatchObject({_tag: 'Tool.Error', message: 'not now'})
      expect(restarts).toEqual([true])

      expect(yield* served.method('restart', {}).pipe(Effect.flip)).toEqual({
        type: 'rpc.method_not_found',
        message: 'Unknown RPC method: server.restart',
      })
      expect(yield* permission.forSession(sessionId)).toEqual([])
      expect(restarts).toEqual([true])
    }),
  )

  it.effect('a missing bundler is BUNDLER_UNAVAILABLE on the tool and the method', () =>
    Effect.gen(function* () {
      const detached = yield* activate(undefined)
      const toolFailure = yield* detached.call('server_config', {}).pipe(Effect.flip)
      expect(toolFailure).toMatchObject({
        _tag: 'Tool.Error',
        message: 'no dev server is attached to conciv',
        metadata: {code: 'BUNDLER_UNAVAILABLE'},
      })
      expect(yield* detached.method('config').pipe(Effect.flip)).toEqual({
        type: 'BUNDLER_UNAVAILABLE',
        message: 'no dev server is attached to conciv',
        data: {},
      })
      expect(yield* detached.call('server_urls', {}).pipe(Effect.flip)).toMatchObject({
        metadata: {code: 'BUNDLER_UNAVAILABLE'},
      })
      expect(yield* detached.method('urls').pipe(Effect.flip)).toMatchObject({type: 'BUNDLER_UNAVAILABLE'})
      expect(yield* detached.call('server_restart', {}).pipe(Effect.flip)).toMatchObject({
        metadata: {code: 'BUNDLER_UNAVAILABLE'},
      })
      expect(yield* detached.method('restart', {}).pipe(Effect.flip)).toEqual({
        type: 'rpc.method_not_found',
        message: 'Unknown RPC method: server.restart',
      })
    }),
  )
})
