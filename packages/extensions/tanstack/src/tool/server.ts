import {defineTool, toolError, type AnyToolBuilder} from '@conciv/extension'
import type {FrameworkAdapter} from '@conciv/contract'
import type {ServerToolRegistryAccess} from '@conciv/extension/registry'
import {buildErrorsDef, routeManifestDef, serverFnTraceDef} from './def.js'

type ToolCtx = {makeAdapter: (tools: ServerToolRegistryAccess) => FrameworkAdapter}

const buildErrorsServer = defineTool(buildErrorsDef).server((_input, ctx: ToolCtx, _request, tools) =>
  ctx.makeAdapter(tools).server.errors.snapshot(),
)

const routeManifestServer = defineTool(routeManifestDef).server(async (_input, ctx: ToolCtx, _request, tools) => {
  try {
    return await ctx.makeAdapter(tools).server.manifest.routes()
  } catch (error) {
    throw toolError('MANIFEST_UNREADABLE', {message: error instanceof Error ? error.message : String(error)})
  }
})

const serverFnTraceServer = defineTool(serverFnTraceDef).server(async (input, ctx: ToolCtx, _request, tools) => {
  const adapter = ctx.makeAdapter(tools)
  if (!adapter.serverFunctions) return {traces: [], functions: []}
  const [traces, functions] = await Promise.all([
    adapter.serverFunctions.traces(input.count ?? Number.MAX_SAFE_INTEGER),
    adapter.serverFunctions.list(),
  ])
  return {traces, functions}
})

export const tanstackServerTools: readonly AnyToolBuilder[] = [
  buildErrorsServer,
  routeManifestServer,
  serverFnTraceServer,
]
