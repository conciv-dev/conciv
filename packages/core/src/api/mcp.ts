import {Hono} from 'hono'
import type {z} from 'zod'
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {concivTools, type ConcivToolContext} from '@conciv/tools'
import {isContentPartArray, type ContentPart} from '@tanstack/ai'
import type {ExtensionServerTool, ToolRequest} from '@conciv/extension'
import {HTTPException} from 'hono/http-exception'
import {
  CONCIV_CLAUDE_SESSION_HEADER,
  CONCIV_SESSION_HEADER,
  isHarnessSessionId,
  isSessionId,
} from '@conciv/protocol/chat-types'
import {logError} from '../lib/debug.js'

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

type ToolDecider = (toolName: string, input: unknown) => Promise<'allow' | 'deny'>

function registerTool(
  server: McpServer,
  tool: RegistrableTool,
  run: (args: unknown) => Promise<unknown>,
  decide: ToolDecider,
): void {
  server.registerTool(tool.name, {description: tool.description, inputSchema: tool.inputSchema.shape}, async (args) => {
    if ((await decide(tool.name, args)) === 'deny') throw new Error(`Tool "${tool.name}" was denied by the user`)
    try {
      return {content: toContent(await run(args))}
    } catch (error) {
      logError(`[mcp] tool "${tool.name}" failed: ${String(error)}`)
      throw error
    }
  })
}

function buildServer(
  ctx: ConcivToolContext,
  extensionTools: ExtensionServerTool[],
  request: ToolRequest,
  decide: ToolDecider,
): McpServer {
  const server = new McpServer({name: 'conciv', version: '0.0.0'})
  for (const tool of concivTools(ctx)) registerTool(server, tool, (args) => tool.execute(args), decide)
  for (const tool of extensionTools) registerTool(server, tool, (args) => tool.execute(args, request), decide)
  return server
}

export type McpVars = {
  mcp: {
    makeCtx: (sessionId: string) => ConcivToolContext
    extensionTools: ExtensionServerTool[]
    sessionModel: (sessionId: string) => string | null
    onRequest: (sessionId: string) => void
    onHarnessDial: (harnessSessionId: string) => void
    sessionForHarnessId: (harnessSessionId: string) => Promise<string | null>
    decide: (sessionId: string, toolName: string, input: unknown) => Promise<'allow' | 'deny'>
  }
}

function harnessSessionIdFromHeaders(headers: Headers): string | null {
  const raw = headers.get(CONCIV_CLAUDE_SESSION_HEADER)?.trim()
  if (!raw) return null
  if (!isHarnessSessionId(raw)) throw new HTTPException(400, {message: 'invalid harness session id'})
  return raw
}

async function requestSessionId(headers: Headers, vars: McpVars['mcp']): Promise<string> {
  const claudeSessionId = harnessSessionIdFromHeaders(headers)
  if (claudeSessionId) vars.onHarnessDial(claudeSessionId)
  const owned = sessionIdFromHeaders(headers)
  if (owned) return owned
  if (!claudeSessionId) return ''
  return (await vars.sessionForHarnessId(claudeSessionId)) ?? ''
}

const app = new Hono<{Variables: McpVars}>().post('/', async (c) => {
  const sessionId = await requestSessionId(c.req.raw.headers, c.var.mcp)
  if (sessionId !== '') c.var.mcp.onRequest(sessionId)
  const ctx = c.var.mcp.makeCtx(sessionId)
  const request: ToolRequest = {sessionId, model: c.var.mcp.sessionModel(sessionId)}
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  const decide = (toolName: string, input: unknown) => c.var.mcp.decide(sessionId, toolName, input)
  await buildServer(ctx, c.var.mcp.extensionTools, request, decide).connect(transport)
  return transport.handleRequest(c.req.raw)
})

export default app
