import type {H3} from 'h3'
import type {z} from 'zod'
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {mandaraxTools, type MandaraxToolContext} from '@mandarax/tools'
import type {ExtensionServerTool, ToolRequest} from '@mandarax/extension'
import {sessionIdFromHeaders} from '../chat/session-id.js'

type RegistrableTool = {name: string; description: string; inputSchema: z.ZodObject<z.ZodRawShape>}

// registerTool wants a Zod raw shape, so we pass each tool's inputSchema.shape (the ZodObject is
// preserved, so .shape is typed). `run` validates args against the tool's schema and executes.
function registerTool(server: McpServer, tool: RegistrableTool, run: (args: unknown) => Promise<unknown>): void {
  server.registerTool(
    tool.name,
    {description: tool.description, inputSchema: tool.inputSchema.shape},
    async (args) => ({
      content: [{type: 'text', text: JSON.stringify(await run(args))}],
    }),
  )
}

// Build an McpServer exposing the mandarax tool registry bound to `ctx`, plus any extension tools. A
// fresh server + transport is created per request: the stateless streamable-HTTP pattern isolates each
// client's request-id state and connect() binds exactly one transport. Core tools carry session via the
// ctx binding; extension tools build their context once at boot, so the per-request `request` is threaded
// into their execute instead (G1).
function buildServer(ctx: MandaraxToolContext, extensionTools: ExtensionServerTool[], request: ToolRequest): McpServer {
  const server = new McpServer({name: 'mandarax', version: '0.0.0'})
  for (const tool of mandaraxTools(ctx)) registerTool(server, tool, (args) => tool.execute(args))
  for (const tool of extensionTools) registerTool(server, tool, (args) => tool.execute(args, request))
  return server
}

// Mount the MCP-over-HTTP server on core's existing h3 app. Web Standard transport: takes the
// incoming web Request and returns a Response, so the route returns it directly — in-process, no
// node-object bridge, no separate server. The ctx is built per request, bound to the caller's
// header session id, so an agent's `mandarax_ui` MCP tool injects onto its own turn's channel.
export function registerMcpRoutes(
  app: H3,
  makeCtx: (sessionId: string) => MandaraxToolContext,
  extensionTools: ExtensionServerTool[] = [],
  previewId = 'local',
): void {
  app.post('/api/mcp', async (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers) ?? '' // '' = no live channel
    const ctx = makeCtx(sessionId)
    const request: ToolRequest = {sessionId, previewId}
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await buildServer(ctx, extensionTools, request).connect(transport)
    return transport.handleRequest(event.req)
  })
}
