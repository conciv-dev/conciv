import type {PageCaller} from '@conciv/extension'
import type {BundlerDiagnostic} from '@conciv/protocol/bundler-types'
import {
  defineFrameworkAdapter,
  type AppError,
  type FrameworkAdapter,
  type FrameworkEvent,
  type ServerFnInfo,
  type ServerFnTrace,
  type ServerRouteInfo,
  type Unsubscribe,
} from '@conciv/protocol/framework-types'
import type {tanstackVerbs} from '../client/verbs.js'

type BundlerSubscribe = (listener: (diagnostic: BundlerDiagnostic) => void) => Unsubscribe

export type TanstackAdapterDeps = {
  page: PageCaller<typeof tanstackVerbs>
  buildErrors: () => AppError[]
  routeManifest: () => Promise<ServerRouteInfo[]>
  serverFnTraces: (count?: number) => ServerFnTrace[]
  serverFns: () => ServerFnInfo[]
  bundlerSubscribe?: BundlerSubscribe
}

function toFrameworkEvent(diagnostic: BundlerDiagnostic): FrameworkEvent {
  if (diagnostic.kind === 'build-error')
    return {kind: 'buildError', at: diagnostic.timestamp, message: diagnostic.message, detail: diagnostic}
  if (diagnostic.kind === 'hmr-update')
    return {kind: 'hmrUpdate', at: diagnostic.timestamp, message: null, detail: diagnostic}
  return {kind: 'requestTrace', at: diagnostic.timestamp, message: null, detail: diagnostic}
}

export function makeTanstackAdapter(deps: TanstackAdapterDeps): FrameworkAdapter {
  const {page} = deps
  return defineFrameworkAdapter({
    name: 'tanstack-start',
    capabilities: {queryCache: true, serverFunctions: true, rscPayload: false, isr: false, middleware: false},
    client: {
      detect: async () => {
        try {
          return await page.call('detect', {})
        } catch {
          return null
        }
      },
      routes: {
        current: () => page.call('routerState', {}),
        tree: () => page.call('routeTree', {}),
      },
      navigation: {
        navigate: async (input) => {
          await page.call('navigate', {to: input.to, replace: input.replace})
        },
        back: async () => {
          await page.call('back', {})
        },
        refresh: async () => {
          await page.call('routerInvalidate', {})
        },
      },
      data: {
        entries: () => page.call('dataEntries', {}),
        get: (key) => page.call('dataGet', {routeId: key}),
        invalidate: async (key) => {
          await page.call('dataInvalidate', {routeId: key})
        },
        refetch: async (key) => {
          await page.call('dataRefetch', {routeId: key})
        },
      },
      errors: {
        snapshot: () => page.call('errorsSnapshot', {}),
      },
    },
    queryCache: {
      queries: async () => (await page.call('queryCache', {})).queries,
      mutations: async () => (await page.call('queryCache', {})).mutations,
      invalidate: async (key) => {
        await page.call('queryInvalidate', {key})
      },
      refetch: async (key) => {
        await page.call('queryRefetch', {key})
      },
    },
    serverFunctions: {
      list: async () => deps.serverFns(),
      traces: async (count) => deps.serverFnTraces(count),
    },
    server: {
      manifest: {
        routes: () => deps.routeManifest(),
      },
      errors: {
        snapshot: async () => deps.buildErrors(),
      },
      events: {
        subscribe: (handler) => {
          const subscribe = deps.bundlerSubscribe
          if (!subscribe) return () => {}
          return subscribe((diagnostic) => handler(toFrameworkEvent(diagnostic)))
        },
      },
      logs: {
        tail: async () => [],
      },
    },
  })
}
