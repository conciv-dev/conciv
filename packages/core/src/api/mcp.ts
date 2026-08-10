import {randomUUID} from 'node:crypto'
import {Hono} from 'hono'
import {z} from 'zod'
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {EventType, isContentPartArray, type ContentPart, type StreamChunk} from '@tanstack/ai'
import type {ToolRequest} from '@conciv/extension'
import type {EngineStaleness} from '@conciv/contract'
import {HTTPException} from 'hono/http-exception'
import {CONCIV_CLAUDE_SESSION_HEADER, CONCIV_SESSION_HEADER, isSessionId} from '@conciv/protocol/chat-types'
import {logError} from '../lib/debug.js'
import {cappedText, RESULT_CAP_CHARS, safeStringify, truncationEnvelope} from '../lib/result-cap.js'
import {loopbackHostAllowlist} from '../lib/cors.js'
import type {CodeCapability} from '../chat/capabilities.js'
import type {PermissionGate} from '../chat/gate.js'
import {makeCodeMode, type CodeMode} from '../chat/code-mode.js'
import {CODE_MODE_TOOL_CALL_EVENT, codeModeToolChunks} from '../chat/code-mode-parts.js'
import {EXECUTE_TOOL_NAME, ExecuteInputSchema, ExecuteResultSchema} from './execute-schemas.js'

export function sessionIdFromHeaders(headers: Headers): string | null {
  const raw = headers.get(CONCIV_SESSION_HEADER)?.trim()
  if (!raw) return null
  if (!isSessionId(raw)) throw new HTTPException(400, {message: 'invalid session id (must be ours)'})
  return raw
}

export function nativeIdFromHeaders(headers: Headers): string | null {
  return headers.get(CONCIV_CLAUDE_SESSION_HEADER)?.trim() || null
}

type TextContent = {type: 'text'; text: string}
type ImageContent = {type: 'image'; data: string; mimeType: string}

type ExecuteReply = {content: (TextContent | ImageContent)[]; isError?: boolean}

function partToContent(part: ContentPart): TextContent | ImageContent {
  if (part.type === 'text') return {type: 'text', text: part.content}
  if (part.type === 'image') {
    return {type: 'image', data: part.source.value, mimeType: part.source.mimeType ?? 'application/octet-stream'}
  }
  return {type: 'text', text: safeStringify(part, `content part of type "${part.type}"`)}
}

const DECLARED_ERROR_PREFIX = /^([A-Z][A-Z0-9_]+): /

function executeDescription(categories: string[]): string {
  const sample = categories.length > 0 ? ` Capability categories include ${categories.join(', ')}.` : ''
  return (
    'Run TypeScript in a secure sandbox wired to this project. Every capability is an async external_* function, and `await external_catalog({search?, name?})` lists them or returns one full typed signature; discovery and calls happen in the same execution.' +
    sample +
    ' Return a value to pass results back; console.log output is captured.'
  )
}

function stalenessNotice(staleness: EngineStaleness): string {
  if (!staleness.stale) return ''
  return `WARNING: this engine is running outdated code. The server code on disk is newer than the running engine (rebuilt since it booted: ${staleness.changed.join(', ')}). Restart the dev server; until then the capabilities listed here can differ from the project's current code.

`
}

export function serverInstructions(categories: string[], staleness: EngineStaleness): string {
  const sample = categories.length > 0 ? `Capability categories include ${categories.join(', ')}.\n` : ''
  return `${stalenessNotice(staleness)}This server exposes one tool: ${EXECUTE_TOOL_NAME}. It runs TypeScript in a sandbox where every project capability is an async external_* function.
${sample}
Workflow: call \`await external_catalog({})\` (or \`external_catalog({search})\`) inside the sandbox to list capabilities with the exact function name each one answers to, \`await external_catalog({name})\` for a full typed signature, then call the function and return a value.

Rules of the sandbox:
- Mutating capabilities may pause for user approval; a denial throws an Error exactly where your code called the function.
- A capability's declared error code arrives as a "CODE: message" prefix on the thrown error's message (typed error objects do not survive the isolate boundary).
- Each execution is isolated: no state, imports, network, or file system carry over between calls.
- Oversized results are truncated to an envelope carrying the reason and a head sample; return less data instead of retrying.`
}

function declaredCodesOf(capabilities: CodeCapability[]): Set<string> {
  return new Set(capabilities.flatMap((capability) => capability.errors.map(({code}) => code)))
}

function decodeDeclaredCode(message: string, declaredCodes: Set<string>): string | undefined {
  const candidate = DECLARED_ERROR_PREFIX.exec(message)?.[1]
  if (candidate === undefined) return undefined
  if (!declaredCodes.has(candidate)) return undefined
  return candidate
}

function errorReply(result: z.infer<typeof ExecuteResultSchema>, declaredCodes: Set<string>): ExecuteReply {
  const message = result.error?.message ?? 'execution failed'
  const code = decodeDeclaredCode(message, declaredCodes)
  const payload = {
    error: {
      message,
      ...(result.error?.name === undefined ? {} : {name: result.error.name}),
      ...(code === undefined ? {} : {code}),
    },
    ...(result.logs === undefined || result.logs.length === 0 ? {} : {logs: result.logs}),
  }
  return {content: [{type: 'text', text: cappedText(safeStringify(payload, 'execution error'))}], isError: true}
}

function cappedParts(parts: (TextContent | ImageContent)[]): (TextContent | ImageContent)[] {
  const totalTextChars = parts.reduce((total, part) => (part.type === 'text' ? total + part.text.length : total), 0)
  if (totalTextChars <= RESULT_CAP_CHARS) return parts
  const kept: (TextContent | ImageContent)[] = []
  const dropped: string[] = []
  let budget = RESULT_CAP_CHARS
  for (const part of parts) {
    if (part.type !== 'text') {
      kept.push(part)
      continue
    }
    if (dropped.length === 0 && part.text.length <= budget) {
      budget -= part.text.length
      kept.push(part)
      continue
    }
    dropped.push(part.text)
  }
  kept.push({
    type: 'text',
    text: truncationEnvelope(
      `the content parts carry ${totalTextChars} characters of text and the cap is ${RESULT_CAP_CHARS}`,
      dropped[0] ?? '',
    ),
  })
  return kept
}

function logsPart(logs: string[]): TextContent[] {
  if (logs.length === 0) return []
  return [{type: 'text', text: cappedText(safeStringify({logs}, 'execution logs'))}]
}

function successReply(result: z.infer<typeof ExecuteResultSchema>): ExecuteReply {
  if (isContentPartArray(result.result)) {
    return {content: cappedParts([...result.result.map(partToContent), ...logsPart(result.logs ?? [])])}
  }
  const body = safeStringify({result: result.result ?? null, logs: result.logs ?? []}, 'execution result')
  return {content: [{type: 'text', text: cappedText(body)}]}
}

type PublishChunks = (chunks: StreamChunk[]) => void

function executeStartChunks(executionId: string, typescriptCode: string): StreamChunk[] {
  return [
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: executionId,
      toolCallName: EXECUTE_TOOL_NAME,
      toolName: EXECUTE_TOOL_NAME,
    },
    {type: EventType.TOOL_CALL_ARGS, toolCallId: executionId, delta: JSON.stringify({typescriptCode})},
    {type: EventType.TOOL_CALL_END, toolCallId: executionId},
  ]
}

function executeResultChunk(executionId: string, reply: ExecuteReply): StreamChunk {
  const text = reply.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n')
  return {
    type: EventType.TOOL_CALL_RESULT,
    messageId: `${executionId}-result`,
    toolCallId: executionId,
    content: text || JSON.stringify({result: 'non-text content'}),
    state: reply.isError === true ? 'output-error' : 'output-available',
  }
}

function sandboxEventContext(
  executionId: string,
  publish: PublishChunks,
): {
  emitCustomEvent: (eventName: string, value: Record<string, unknown>) => void
} {
  return {
    emitCustomEvent: (eventName, value) => {
      const stamped = eventName === CODE_MODE_TOOL_CALL_EVENT ? {...value, toolCallId: executionId} : value
      const mapped = codeModeToolChunks({
        type: EventType.CUSTOM,
        name: eventName,
        value: stamped,
        timestamp: Date.now(),
      })
      if (mapped) publish(mapped)
    },
  }
}

async function runExecute(
  codeMode: CodeMode,
  typescriptCode: string,
  publish: PublishChunks,
  declaredCodes: () => Set<string>,
): Promise<ExecuteReply> {
  const executionId = randomUUID()
  publish(executeStartChunks(executionId, typescriptCode))
  const raw = await codeMode
    .run(typescriptCode, sandboxEventContext(executionId, publish))
    .catch((error: unknown) => ({success: false, error: {message: String(error)}}))
  const parsed = ExecuteResultSchema.safeParse(raw)
  const result = parsed.success
    ? parsed.data
    : {success: false, error: {message: 'the sandbox returned an unreadable result'}}
  const reply = result.success ? successReply(result) : errorReply(result, declaredCodes())
  publish([executeResultChunk(executionId, reply)])
  return reply
}

type McpDeps = {
  capabilities: (sessionId: string) => CodeCapability[]
  askGate: (sessionId: string) => PermissionGate
  listening: (sessionId: string) => boolean
  publish: (sessionId: string, chunk: StreamChunk) => void
  sessionModel: (sessionId: string) => string | null
  sessionForNativeId: (nativeId: string) => Promise<string | null>
  staleness: () => EngineStaleness
}

export type McpVars = {mcp: McpDeps}

async function buildServer(deps: McpDeps, request: ToolRequest): Promise<McpServer> {
  const gate = deps.askGate(request.sessionId)
  const codeMode = await makeCodeMode(() => deps.capabilities(request.sessionId), request, gate, {
    listening: deps.listening,
  })
  const server = new McpServer(
    {name: 'conciv', version: '0.0.0'},
    {instructions: serverInstructions(codeMode?.categories ?? [], deps.staleness())},
  )
  if (codeMode === null) {
    logError('[mcp] code mode is unavailable (isolated-vm incompatible or an empty registry); no tools registered')
    return server
  }
  const publish: PublishChunks = request.sessionId
    ? (chunks) => chunks.forEach((chunk) => deps.publish(request.sessionId, chunk))
    : () => {}
  const declaredCodes = () => declaredCodesOf(deps.capabilities(request.sessionId))
  server.registerTool(
    EXECUTE_TOOL_NAME,
    {description: executeDescription(codeMode.categories), inputSchema: ExecuteInputSchema.shape},
    async (args) => {
      try {
        return await runExecute(codeMode, args.typescriptCode, publish, declaredCodes)
      } catch (error) {
        logError(`[mcp] ${EXECUTE_TOOL_NAME} failed outside the sandbox: ${String(error)}`)
        throw error
      }
    },
  )
  return server
}

const app = new Hono<{Variables: McpVars}>().post('/', async (c) => {
  const allowedHosts = loopbackHostAllowlist(c.req.header('host') ?? null)
  if (allowedHosts.length === 0) return c.text('forbidden host', 403)
  const nativeId = nativeIdFromHeaders(c.req.raw.headers)
  const nativeOwner = nativeId ? await c.var.mcp.sessionForNativeId(nativeId) : null
  const sessionId = sessionIdFromHeaders(c.req.raw.headers) ?? nativeOwner ?? ''
  const request: ToolRequest = {sessionId, model: c.var.mcp.sessionModel(sessionId)}
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    enableDnsRebindingProtection: true,
    allowedHosts,
  })
  const server = await buildServer(c.var.mcp, request)
  await server.connect(transport)
  return transport.handleRequest(c.req.raw)
})

export default app
