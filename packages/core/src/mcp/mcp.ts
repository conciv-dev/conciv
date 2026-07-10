import {Hono} from 'hono'
import type {z} from 'zod'
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {concivTools, type ConcivToolContext} from '@conciv/tools'
import {isContentPartArray, type ContentPart} from '@tanstack/ai'
import type {ExtensionServerTool, ToolRequest} from '@conciv/extension'
import {HTTPException} from 'hono/http-exception'
import {CONCIV_SESSION_HEADER, isSessionId} from '@conciv/protocol/chat-types'
import {logError} from '../debug.js'

export function sessionIdFromHeaders(headers: Headers): string | null {
  const raw = headers.get(CONCIV_SESSION_HEADER)?.trim()
  if (!raw) return null
  if (!isSessionId(raw)) throw new HTTPException(400, {message: 'invalid session id (must be ours)'})
  return raw
}

type RegistrableTool = {name: string; description: string; inputSchema: z.ZodObject<z.ZodRawShape>}

type TextContent = {type: 'text'; text: string}
type ImageContent = {type: 'image'; data: string; mimeType: string}

function safeStringify(value: unknown, context: string): string {
  try {
    return JSON.stringify(value) ?? 'null'
  } catch (error) {
    logError(`[mcp] ${context} was not JSON-serializable: ${String(error)}`)
    return JSON.stringify({error: 'value could not be serialized', reason: String(error)})
  }
}

function partToContent(part: ContentPart): TextContent | ImageContent {
  if (part.type === 'text') return {type: 'text', text: part.content}
  if (part.type === 'image') {
    return {type: 'image', data: part.source.value, mimeType: part.source.mimeType ?? 'application/octet-stream'}
  }
  return {type: 'text', text: safeStringify(part, `content part of type "${part.type}"`)}
}

function toContent(result: unknown): (TextContent | ImageContent)[] {
  if (isContentPartArray(result)) return result.map(partToContent)
  return [{type: 'text', text: safeStringify(result, 'tool result')}]
}

function registerTool(server: McpServer, tool: RegistrableTool, run: (args: unknown) => Promise<unknown>): void {
  server.registerTool(tool.name, {description: tool.description, inputSchema: tool.inputSchema.shape}, async (args) => {
    try {
      return {content: toContent(await run(args))}
    } catch (error) {
      logError(`[mcp] tool "${tool.name}" failed: ${String(error)}`)
      throw error
    }
  })
}

function buildServer(ctx: ConcivToolContext, extensionTools: ExtensionServerTool[], request: ToolRequest): McpServer {
  const server = new McpServer({name: 'conciv', version: '0.0.0'})
  for (const tool of concivTools(ctx)) registerTool(server, tool, (args) => tool.execute(args))
  for (const tool of extensionTools) registerTool(server, tool, (args) => tool.execute(args, request))
  return server
}

export type McpVars = {
  mcp: {
    makeCtx: (sessionId: string) => ConcivToolContext
    extensionTools: ExtensionServerTool[]
    sessionModel: (sessionId: string) => string | null
  }
}

const app = new Hono<{Variables: McpVars}>().post('/', async (c) => {
  const sessionId = sessionIdFromHeaders(c.req.raw.headers) ?? ''
  const ctx = c.var.mcp.makeCtx(sessionId)
  const request: ToolRequest = {sessionId, model: c.var.mcp.sessionModel(sessionId)}
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await buildServer(ctx, c.var.mcp.extensionTools, request).connect(transport)
  return transport.handleRequest(c.req.raw)
})

export default app
