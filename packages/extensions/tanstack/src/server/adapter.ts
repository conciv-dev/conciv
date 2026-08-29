import type {z} from 'zod'
import type {ServerToolRegistryAccess} from '@conciv/extension/registry'
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
import {
  backDef,
  dataEntriesDef,
  dataInvalidateDef,
  detectDef,
  errorsSnapshotDef,
  loaderDataDef,
  navigateDef,
  queryCacheDef,
  queryInvalidateDef,
  queryRefetchDef,
  routeTreeDef,
  routerInvalidateDef,
  routerStateDef,
  RouteNodeSchema,
} from '../tool/def.js'

type BundlerSubscribe = (listener: (diagnostic: BundlerDiagnostic) => void) => Unsubscribe

export type TanstackAdapterDeps = {
  tools: ServerToolRegistryAccess
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

function makeVerbCaller(tools: ServerToolRegistryAccess) {
  return async <Out extends z.ZodType>(
    def: {name: string; outputSchema?: Out},
    input: Record<string, unknown>,
  ): Promise<z.output<Out>> => {
    const output = def.outputSchema
    if (output === undefined) throw new Error(`tanstack verb "${def.name}" declares no output schema`)
    return output.parse(await tools.call(def.name, input))
  }
}

export function makeTanstackAdapter(deps: TanstackAdapterDeps): FrameworkAdapter {
  const call = makeVerbCaller(deps.tools)
  return defineFrameworkAdapter({
    name: 'tanstack-start',
    capabilities: {queryCache: true, serverFunctions: true, rscPayload: false, isr: false, middleware: false},
    client: {
      detect: async () => {
        try {
          return await call(detectDef, {})
        } catch {
          return null
        }
      },
      routes: {
        current: () => call(routerStateDef, {}),
        tree: async () => RouteNodeSchema.parse(await call(routeTreeDef, {})),
      },
      navigation: {
        navigate: async (input) => {
          await call(navigateDef, {
            to: input.to,
            ...(input.params === undefined ? {} : {params: input.params}),
            ...(input.search === undefined ? {} : {search: input.search}),
            ...(input.replace === undefined ? {} : {replace: input.replace}),
          })
        },
        back: async () => {
          await call(backDef, {})
        },
        refresh: async () => {
          await call(routerInvalidateDef, {})
        },
      },
      data: {
        entries: async () => (await call(dataEntriesDef, {})).entries,
        get: async (key) => (await call(loaderDataDef, {routeId: key})).data,
        invalidate: async (key) => {
          await call(dataInvalidateDef, {routeId: key})
        },
      },
      errors: {
        snapshot: async () => (await call(errorsSnapshotDef, {})).errors,
      },
    },
    queryCache: {
      queries: async () => (await call(queryCacheDef, {})).queries,
      mutations: async () => (await call(queryCacheDef, {})).mutations,
      invalidate: async (key) => {
        await call(queryInvalidateDef, {key})
      },
      refetch: async (key) => {
        await call(queryRefetchDef, {key})
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
