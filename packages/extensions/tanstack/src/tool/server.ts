import {defineTool, toolError, type AnyToolBuilder} from '@conciv/extension'
import type {ToolDefinition} from '@conciv/extension/tool'
import type {z} from 'zod'
import type {FrameworkAdapter} from '@conciv/protocol/framework-types'
import type {ServerToolRegistryAccess} from '@conciv/extension/registry'
import {buildErrorsDef, routeManifestDef, serverFnTraceDef, TANSTACK_PAGE_TOOL_DEFS} from './def.js'

type ToolCtx = {makeAdapter: (tools: ServerToolRegistryAccess) => FrameworkAdapter}

const buildErrorsServer = defineTool(buildErrorsDef).server((_input, ctx: ToolCtx, _request, _page, tools) =>
  ctx.makeAdapter(tools).server.errors.snapshot(),
)

const routeManifestServer = defineTool(routeManifestDef).server(
  async (_input, ctx: ToolCtx, _request, _page, tools) => {
    try {
      return await ctx.makeAdapter(tools).server.manifest.routes()
    } catch (error) {
      throw toolError('MANIFEST_UNREADABLE', {message: error instanceof Error ? error.message : String(error)})
    }
  },
)

const serverFnTraceServer = defineTool(serverFnTraceDef).server(async (input, ctx: ToolCtx, _request, _page, tools) => {
  const adapter = ctx.makeAdapter(tools)
  if (!adapter.serverFunctions) return {traces: [], functions: []}
  const [traces, functions] = await Promise.all([
    adapter.serverFunctions.traces(input.count ?? Number.MAX_SAFE_INTEGER),
    adapter.serverFunctions.list(),
  ])
  return {traces, functions}
})

function pageToolDeclaration(def: ToolDefinition<string, z.ZodObject<z.ZodRawShape>, z.ZodType>): AnyToolBuilder {
  return defineTool(def).client()
}

export const tanstackServerTools: readonly AnyToolBuilder[] = [
  buildErrorsServer,
  routeManifestServer,
  serverFnTraceServer,
  ...TANSTACK_PAGE_TOOL_DEFS.map(pageToolDeclaration),
]
