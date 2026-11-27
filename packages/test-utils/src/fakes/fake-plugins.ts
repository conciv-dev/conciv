import {ORPCError} from '@orpc/server'
import {notImplemented} from './fake-router.js'
import type {Call, FakeBundle, FakeEngineOptions, FakePluginCall} from './fake-types.js'

type Publish = (type: string, data: Record<string, unknown>) => void

function noBundle(pluginId: string): never {
  throw new ORPCError('PLUGIN_NOT_FOUND', {
    message: 'no active plugin with a ./plugin-experimental bundle',
    data: {pluginId, message: `the fake engine serves no plugin bundle ${pluginId}`},
  })
}

function noChunk(pluginId: string, file: string): never {
  throw new ORPCError('PLUGIN_CHUNK_NOT_FOUND', {
    message: "no such chunk in the plugin's current build",
    data: {pluginId, file},
  })
}

export function createPlugins(
  options: Pick<FakeEngineOptions, 'plugins' | 'bundles'>,
  location: {readonly directory: string},
  unanswered: string[],
  publish: Publish,
) {
  const state: {bundles: readonly FakeBundle[]} = {bundles: options.bundles ?? []}
  const find = (id: string): FakeBundle | undefined => state.bundles.find((bundle) => bundle.info.id === id)
  const emit: FakePluginCall['emit'] = publish
  return {
    emit,
    setBundles: (bundles: readonly FakeBundle[]): void => {
      state.bundles = bundles
      publish('plugin.updated', {})
    },
    handlers: {
      invoke: ({rpcId, method, input}: {rpcId: string; method: string; input?: unknown}, call: Call): unknown => {
        const handler = options.plugins?.[rpcId]?.[method]
        if (handler === undefined) return notImplemented(`plugin.invoke ${rpcId}.${method}`, unanswered)
        return handler(input, {emit, signal: call.signal})
      },
      list: () => ({location, data: state.bundles.map((bundle) => bundle.info)}),
      experimental: async ({id}: {id: string}) => {
        const load = find(id)?.experimental ?? noBundle(id)
        return {location, data: await load()}
      },
      experimentalChunk: async ({id, file}: {id: string; file: string}) => {
        const bundle = find(id) ?? noBundle(id)
        const build = await (bundle.experimental ?? noBundle(id))()
        const chunks = await (bundle.chunk ?? (() => noChunk(id, file)))(file)
        return {location, data: {revision: build.revision, chunks}}
      },
    },
  }
}
