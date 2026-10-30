import {randomUUID} from 'node:crypto'
import {Hono} from 'hono'
import {z} from 'zod'
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {generateMessageId, ChatEventType, isContentParts, type ChatEvent, type ContentPart} from '@conciv/ai'
import type {EngineStaleness} from '@conciv/contract'
import {HTTPException} from 'hono/http-exception'
import {
  CONCIV_CLAUDE_SESSION_HEADER,
  CONCIV_SESSION_HEADER,
  isHarnessSessionId,
  isSessionId,
  type HarnessSessionId,
  type SessionId,
} from '@conciv/protocol/chat-types'
import type {SessionScope} from '../runtime/scope-types.js'
import {logError} from '../lib/debug.js'
import {
  cappedText,
  cappedValue,
  RESULT_CAP_CHARS,
  safeStringify,
  truncationEnvelope,
  type CodeRunner,
  type CodeTool,
} from '@conciv/chat'
import {loopbackHostAllowlist} from '../lib/cors.js'
import {EXECUTE_TOOL_NAME, ExecuteInputSchema, ExecuteResultSchema} from './execute-schemas.js'

export function sessionIdFromHeaders(headers: Headers): SessionId | null {
  const raw = headers.get(CONCIV_SESSION_HEADER)?.trim()
  if (!raw) return null
  if (!isSessionId(raw)) throw new HTTPException(400, {message: 'invalid session id (must be ours)'})
  return raw
}

export function nativeIdFromHeaders(headers: Headers): HarnessSessionId | null {
  const raw = headers.get(CONCIV_CLAUDE_SESSION_HEADER)?.trim()
  if (!raw) return null
  if (!isHarnessSessionId(raw)) throw new HTTPException(400, {message: 'invalid harness session id'})
  return raw
}

type TextContent = {type: 'text'; text: string}
type ImageContent = {type: 'image'; data: string; mimeType: string}

type ExecuteReply = {content: (TextContent | ImageContent)[]; isError?: boolean}

function partToContent(part: ContentPart): TextContent | ImageContent {
  if (part.type === 'text') return {type: 'text', text: part.content}
  if (part.type === 'image') {
    return {type: 'image', data: part.source.value, mimeType: part.source.mimeType ?? 'application/octet-stream'}
  }
  return {type: 'text', text: safeStringify(part)}
}

const DISCOVER_TOOL_NAME = 'discover_tools'

const DiscoverInputSchema = z.object({toolNames: z.array(z.string())})

const DECLARED_ERROR_PREFIX = /^([A-Z][A-Z0-9_]+): /

const EXECUTE_DESCRIPTION =
  'Run TypeScript in a secure sandbox wired to this project. Every capability is an async external_* function; call discover_tools first for their typed signatures. Return a value to pass results back; console.log output is captured.'

function stalenessNotice(staleness: EngineStaleness): string {
  if (!staleness.stale) return ''
  return `WARNING: this engine is running outdated code. The server code on disk is newer than the running engine (rebuilt since it booted: ${staleness.changed.join(', ')}). Restart the dev server; until then the capabilities listed here can differ from the project's current code.

`
}

export function serverInstructions(capabilities: string, staleness: EngineStaleness): string {
  return `${stalenessNotice(staleness)}This server exposes ${EXECUTE_TOOL_NAME}, which runs TypeScript in a sandbox where every project capability is an async external_* function, and ${DISCOVER_TOOL_NAME}, which returns their full typed signatures.

${capabilities}

Rules of the sandbox:
- A capability's declared error code arrives as a "CODE: message" prefix on the thrown error's message (typed error objects do not survive the isolate boundary).
- Each execution is isolated: no state, imports, network, or file system carry over between calls.
- Oversized results are truncated to an envelope carrying the reason and a head sample; return less data instead of retrying.`
}

function decodeDeclaredCode(message: string, declaredCodes: ReadonlySet<string>): string | undefined {
  const candidate = DECLARED_ERROR_PREFIX.exec(message)?.[1]
  if (candidate === undefined || !declaredCodes.has(candidate)) return undefined
  return candidate
}

function errorReply(result: z.infer<typeof ExecuteResultSchema>, declaredCodes: ReadonlySet<string>): ExecuteReply {
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
  return {content: [{type: 'text', text: cappedText(safeStringify(payload))}], isError: true}
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
  return [{type: 'text', text: cappedText(safeStringify({logs}))}]
}

function successReply(result: z.infer<typeof ExecuteResultSchema>): ExecuteReply {
  if (isContentParts(result.result)) {
    return {content: cappedParts([...result.result.map(partToContent), ...logsPart(result.logs ?? [])])}
  }
  const body = safeStringify({result: result.result ?? null, logs: result.logs ?? []})
  return {content: [{type: 'text', text: cappedText(body)}]}
}

type PublishChunks = (chunks: ChatEvent[]) => void

function callStartChunks(callId: string, toolName: string, input: unknown): ChatEvent[] {
  return [
    {type: ChatEventType.TOOL_CALL_START, toolCallId: callId, toolCallName: toolName},
    {type: ChatEventType.TOOL_CALL_ARGS, toolCallId: callId, delta: safeStringify(input)},
    {type: ChatEventType.TOOL_CALL_END, toolCallId: callId},
  ]
}

function executeResultChunk(executionId: string, reply: ExecuteReply): ChatEvent {
  const text = reply.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n')
  return {
    type: ChatEventType.TOOL_CALL_RESULT,
    messageId: generateMessageId(),
    toolCallId: executionId,
    content: text || JSON.stringify({result: 'non-text content'}),
    ...(reply.isError === true && {metadata: {tanstack: {state: 'output-error'}}}),
  }
}

async function runExecute(runner: CodeRunner, typescriptCode: string, publish: PublishChunks): Promise<ExecuteReply> {
  const executionId = randomUUID()
  publish(callStartChunks(executionId, EXECUTE_TOOL_NAME, {typescriptCode}))
  const raw = await runner
    .run(typescriptCode, executionId)
    .catch((error: unknown) => ({success: false, error: {message: String(error)}}))
  const parsed = ExecuteResultSchema.safeParse(raw)
  const result = parsed.success
    ? parsed.data
    : {success: false, error: {message: 'the sandbox returned an unreadable result'}}
  const reply = result.success ? successReply(result) : errorReply(result, runner.declaredCodes)
  publish([executeResultChunk(executionId, reply)])
  return reply
}

async function runDirect(tool: CodeTool, input: unknown, publish: PublishChunks): Promise<ExecuteReply> {
  const callId = randomUUID()
  publish(callStartChunks(callId, tool.name, input))
  const reply: ExecuteReply = await tool.run(input, callId).then(
    (value) => ({content: [{type: 'text', text: cappedText(safeStringify(value))}]}),
    (error: unknown) => ({
      content: [{type: 'text', text: cappedText(safeStringify({error: {message: String(error)}}))}],
      isError: true,
    }),
  )
  publish([executeResultChunk(callId, reply)])
  return reply
}

async function runDiscover(runner: CodeRunner, toolNames: string[]): Promise<ExecuteReply> {
  if (runner.discover === null) return {content: [{type: 'text', text: 'no tools to discover'}], isError: true}
  const found = await runner.discover.run(toolNames)
  return {content: [{type: 'text', text: cappedText(safeStringify(cappedValue(found)))}]}
}

type McpDeps = {
  codeRunner: (sessionId: SessionId) => Promise<CodeRunner | null>
  resolveSession: (header: SessionId | null, nativeId: HarnessSessionId | null) => Promise<SessionScope>
  staleness: () => EngineStaleness
}

export type McpVars = {mcp: McpDeps}

async function buildServer(deps: McpDeps, scope: SessionScope): Promise<McpServer> {
  const runner = await deps.codeRunner(scope.id)
  const server = new McpServer(
    {name: 'conciv', version: '0.0.0'},
    {instructions: serverInstructions(runner?.systemPrompt ?? '', deps.staleness())},
  )
  if (runner === null) {
    logError('[mcp] code mode is unavailable (no isolate driver or an empty registry); no tools registered')
    return server
  }
  const publish: PublishChunks = (chunks) => chunks.forEach((chunk) => scope.stream.publish(chunk))
  if (runner.discover !== null) {
    server.registerTool(
      DISCOVER_TOOL_NAME,
      {description: runner.discover.description, inputSchema: DiscoverInputSchema.shape},
      (args) => runDiscover(runner, args.toolNames),
    )
  }
  for (const tool of runner.asking) {
    server.registerTool(tool.name, {description: tool.description, inputSchema: tool.inputSchema.shape}, (args) =>
      runDirect(tool, args, publish),
    )
  }
  server.registerTool(
    EXECUTE_TOOL_NAME,
    {description: EXECUTE_DESCRIPTION, inputSchema: ExecuteInputSchema.shape},
    async (args) => {
      try {
        return await runExecute(runner, args.typescriptCode, publish)
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
  const scope = await c.var.mcp.resolveSession(
    sessionIdFromHeaders(c.req.raw.headers),
    nativeIdFromHeaders(c.req.raw.headers),
  )
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    enableDnsRebindingProtection: true,
    allowedHosts,
  })
  const server = await buildServer(c.var.mcp, scope)
  await server.connect(transport)
  return transport.handleRequest(c.req.raw)
})

export default app
