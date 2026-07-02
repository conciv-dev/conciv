import type {H3} from 'h3'
import type {z} from 'zod'
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {concivTools, type ConcivToolContext} from '@conciv/tools'
import type {ExtensionServerTool, ToolRequest} from '@conciv/extension'
import {sessionIdFromHeaders} from '../chat/session-id.js'

type RegistrableTool = {name: string; description: string; inputSchema: z.ZodObject<z.ZodRawShape>}

function registerTool(server: McpServer, tool: RegistrableTool, run: (args: unknown) => Promise<unknown>): void {
  server.registerTool(
    tool.name,
    {description: tool.description, inputSchema: tool.inputSchema.shape},
    async (args) => ({
      content: [{type: 'text', text: JSON.stringify(await run(args))}],
    }),
  )
}

function buildServer(ctx: ConcivToolContext, extensionTools: ExtensionServerTool[], request: ToolRequest): McpServer {
  const server = new McpServer({name: 'conciv', version: '0.0.0'})
  for (const tool of concivTools(ctx)) registerTool(server, tool, (args) => tool.execute(args))
  for (const tool of extensionTools) registerTool(server, tool, (args) => tool.execute(args, request))
  return server
}

export function registerMcpRoutes(
  app: H3,
  makeCtx: (sessionId: string) => ConcivToolContext,
  extensionTools: ExtensionServerTool[] = [],
  sessionModel: (sessionId: string) => string | null = () => null,
): void {
  app.post('/api/mcp', async (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers) ?? ''
    const ctx = makeCtx(sessionId)
    const request: ToolRequest = {sessionId, model: sessionModel(sessionId)}
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await buildServer(ctx, extensionTools, request).connect(transport)
    return transport.handleRequest(event.req)
  })
}
