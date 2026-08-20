import type {z} from 'zod'
import type {ServerToolCaller} from '@conciv/extension'
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
  dataGetDef,
  dataInvalidateDef,
  dataRefetchDef,
  detectDef,
  errorsSnapshotDef,
  navigateDef,
  queryCacheDef,
  queryInvalidateDef,
  queryRefetchDef,
  routeTreeDef,
  routerInvalidateDef,
  routerStateDef,
} from '../shared/verb-defs.js'

type BundlerSubscribe = (listener: (diagnostic: BundlerDiagnostic) => void) => Unsubscribe

export type TanstackAdapterDeps = {
  tools: ServerToolCaller
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

function makeVerbCaller(tools: ServerToolCaller) {
  return async <Out extends z.ZodType>(
    def: {name: string; outputSchema?: Out},
    input: Record<string, unknown>,
    sessionId: string,
  ): Promise<z.output<Out>> => {
    const output = def.outputSchema
    if (output === undefined) throw new Error(`tanstack verb "${def.name}" declares no output schema`)
    return output.parse(await tools.call(def.name, input, sessionId))
  }
}

export function makeTanstackAdapter(deps: TanstackAdapterDeps): FrameworkAdapter {
  const call = makeVerbCaller(deps.tools)
  return defineFrameworkAdapter({
    name: 'tanstack-start',
    capabilities: {queryCache: true, serverFunctions: true, rscPayload: false, isr: false, middleware: false},
    client: {
      detect: async (sessionId) => {
        try {
          return (await call(detectDef, {}, sessionId)).result
        } catch {
          return null
        }
      },
      routes: {
        current: async (sessionId) => (await call(routerStateDef, {}, sessionId)).result,
        tree: async (sessionId) => (await call(routeTreeDef, {}, sessionId)).result,
      },
      navigation: {
        navigate: async (sessionId, input) => {
          await call(
            navigateDef,
            {
              to: input.to,
              ...(input.params === undefined ? {} : {params: input.params}),
              ...(input.search === undefined ? {} : {search: input.search}),
              ...(input.replace === undefined ? {} : {replace: input.replace}),
            },
            sessionId,
          )
        },
        back: async (sessionId) => {
          await call(backDef, {}, sessionId)
        },
        refresh: async (sessionId) => {
          await call(routerInvalidateDef, {}, sessionId)
        },
      },
      data: {
        entries: async (sessionId) => (await call(dataEntriesDef, {}, sessionId)).result,
        get: async (sessionId, key) => (await call(dataGetDef, {routeId: key}, sessionId)).result,
        invalidate: async (sessionId, key) => {
          await call(dataInvalidateDef, {routeId: key}, sessionId)
        },
        refetch: async (sessionId, key) => {
          await call(dataRefetchDef, {routeId: key}, sessionId)
        },
      },
      errors: {
        snapshot: async (sessionId) => (await call(errorsSnapshotDef, {}, sessionId)).result,
      },
    },
    queryCache: {
      queries: async (sessionId) => (await call(queryCacheDef, {}, sessionId)).result.queries,
      mutations: async (sessionId) => (await call(queryCacheDef, {}, sessionId)).result.mutations,
      invalidate: async (sessionId, key) => {
        await call(queryInvalidateDef, {key}, sessionId)
      },
      refetch: async (sessionId, key) => {
        await call(queryRefetchDef, {key}, sessionId)
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
