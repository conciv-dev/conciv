import type {H3} from 'h3'
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {mandaraxTools, type MandaraxToolContext} from '@mandarax/tools'
import type {ExtensionServerTool} from '@mandarax/extension'
import {sessionIdFromHeaders} from '../chat/session-id.js'

// Build an McpServer exposing the mandarax tool registry bound to `ctx`, plus any extension tools. A
// fresh server + transport is created per request: the stateless streamable-HTTP pattern isolates
// each client's request-id state and connect() binds exactly one transport. registerTool wants a Zod
// raw shape, so we pass each tool's inputSchema.shape (the ZodObject is preserved, so .shape is typed).
function buildServer(ctx: MandaraxToolContext, extensionTools: ExtensionServerTool[]): McpServer {
  const server = new McpServer({name: 'mandarax', version: '0.0.0'})
  for (const tool of [...mandaraxTools(ctx), ...extensionTools]) {
    server.registerTool(
      tool.name,
      {description: tool.description, inputSchema: tool.inputSchema.shape},
      async (args) => {
        // tool.execute validates args against its zod schema once at this boundary, then runs.
        const result = await tool.execute(args)
        return {content: [{type: 'text', text: JSON.stringify(result)}]}
      },
    )
  }
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
): void {
  app.post('/api/mcp', async (event) => {
    const ctx = makeCtx(sessionIdFromHeaders(event.req.headers) ?? '') // '' = no live channel
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await buildServer(ctx, extensionTools).connect(transport)
    return transport.handleRequest(event.req)
  })
}
