import {describe, expect} from 'vitest'
import {Effect} from 'effect'
import {defineBundlerBridge} from '@conciv/protocol/bundler-types'
import {Agent} from '../../src/core/agent.js'
import {Plugin} from '../../src/core/plugin.js'
import {PluginHost} from '../../src/core/plugin/host.js'
import {Rpc} from '../../src/core/rpc.js'
import {Tool} from '../../src/core/tool.js'
import {ServerTools} from '../../src/core/tool/plugin/server.js'
import {Tool as ToolSchema} from '../../src/schema/tool.js'
import {Session} from '../../src/schema/session.js'
import {testEffect} from './lib/effect'
import {PluginTestLayer} from './plugin/fixture'

const it = testEffect(PluginTestLayer)

const sessionId = Session.Id.make('conciv_server_tool_test')

const bridge = defineBundlerBridge({
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
  restart: async () => {},
})

const activate = (bundler: typeof bridge | undefined) =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const context = yield* PluginHost.make(plugins, ServerTools.Plugin.id).pipe(
      Effect.provideService(PluginHost.BundlerSource, bundler),
    )
    yield* ServerTools.Plugin.effect(context)
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
      ])
      expect(served.snapshot.codeMode?.namespaces.get('server')).toMatchObject({name: 'server'})

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
        type: 'rpc.internal',
        message: 'RPC call failed',
      })
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
    }),
  )
})
