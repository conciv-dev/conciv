import type {H3} from 'h3'
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {aidxTools, type AidxToolContext} from '@aidx/tools'

// Build an McpServer exposing the aidx tool registry bound to `ctx`. A fresh server + transport is
// created per request: the stateless streamable-HTTP pattern isolates each client's request-id
// state and connect() binds exactly one transport. registerTool wants a Zod raw shape, so we pass
// each tool's inputSchema.shape (the ZodObject is preserved on the tool, so .shape is typed).
function buildServer(ctx: AidxToolContext): McpServer {
  const server = new McpServer({name: 'aidx', version: '0.0.0'})
  for (const tool of aidxTools(ctx)) {
    const execute = tool.execute
    if (!tool.inputSchema || !execute) continue
    server.registerTool(tool.name, {description: tool.description, inputSchema: tool.inputSchema.shape}, async (args) => {
      const result = await execute(args)
      return {content: [{type: 'text', text: JSON.stringify(result)}]}
    })
  }
  return server
}

// Mount the MCP-over-HTTP server on core's existing h3 app. Web Standard transport: takes the
// incoming web Request and returns a Response, so the route returns it directly — in-process, no
// node-object bridge, no separate server.
export function registerMcpRoutes(app: H3, ctx: AidxToolContext): void {
  app.post('/api/mcp', async (event) => {
    const transport = new WebStandardStreamableHTTPServerTransport({sessionIdGenerator: undefined, enableJsonResponse: true})
    await buildServer(ctx).connect(transport)
    return transport.handleRequest(event.req)
  })
}
