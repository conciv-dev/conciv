import {Hono} from 'hono'
import {z} from 'zod'
import {defineTool} from '@conciv/protocol/chat-tool-types'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {
  cappedText,
  cappedValue,
  codeDiscoverReply,
  codeExecuteReply,
  queueNotice,
  safeStringify,
  toolValueReply,
  type CodeDescriptions,
  type CodeDiscoverResult,
  type CodeExecuteResult,
  type CodeReply,
  type CodeReplyContent,
  type EngineStaleness,
} from '@conciv/contract'
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
import corePackage from '../../package.json' with {type: 'json'}
import type {ChatPlane, CodeCapability, CodeRunner, CodeSandbox, CodeTool} from '@conciv/chat'
import {createMCPServer} from '@conciv/ai/server'
import {CodeModeCatalog, CodeModeInstructions} from '@conciv/plugin-host'
import {loopbackHostAllowlist} from '../lib/cors.js'
import {callTrace} from './call-trace.js'
import {EXECUTE_TOOL_NAME, ExecuteInputSchema, ExecuteResultSchema, type ExecuteResult} from './execute-schemas.js'
import type {PageQueueHandle, PageQueueResult} from '@conciv/protocol/page-types'

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

type CodeExecuteError = Extract<CodeExecuteResult, {ok: false}>['error']

const DISCOVER_TOOL_NAME = 'discover_tools'

const DiscoverInputSchema = z.object({toolNames: z.array(z.string())})

const DECLARED_ERROR_PREFIX = /^([A-Z][A-Z0-9_]+): /

const EXECUTE_DESCRIPTION =
  'Run TypeScript in a secure sandbox wired to this project. Every capability is an async external_* function; call discover_tools first for their typed signatures. Return a value to pass results back; console.log output is captured.'

const STALE_PREFIX =
  'WARNING: this engine is running outdated code. The server code on disk is newer than the running engine (rebuilt since it booted: '

const STALE_SUFFIX =
  "). Restart the dev server; until then the capabilities listed here can differ from the project's current code.\n\n"

function stalenessNotice(staleness: EngineStaleness, room: number): string {
  if (!staleness.stale) return ''
  const changed = fittedList(staleness.changed, room - STALE_PREFIX.length - STALE_SUFFIX.length)
  return `${STALE_PREFIX}${changed}${STALE_SUFFIX}`
}

const SANDBOX_RULES = `Rules of the sandbox:
- A capability's declared error code arrives as a "CODE: message" prefix on the thrown error's message (typed error objects do not survive the isolate boundary).
- Each execution is isolated: no state, imports, network, or file system carry over between calls.
- Oversized results are truncated to an envelope carrying the reason and a head sample; return less data instead of retrying.`

const DESCRIPTION_BUDGET_CHARS = 4096

const NAME_SEPARATOR = ', '

const LISTED_CHARACTERS_PER_TOKEN = 5

function executeDescription(runner: CodeSandbox, staleness: EngineStaleness): string {
  const rest = `${EXECUTE_DESCRIPTION}\n\n${SANDBOX_RULES}\n\n`
  const floor = CodeModeCatalog.summarize(runner.inventory, {budget: 0})
  const floorText = CodeModeInstructions.render(floor)
  const head = `${stalenessNotice(staleness, DESCRIPTION_BUDGET_CHARS - rest.length - floorText.length)}${rest}`
  const spare = Math.floor((DESCRIPTION_BUDGET_CHARS - head.length - floorText.length) / LISTED_CHARACTERS_PER_TOKEN)
  const budget = chargedCost(floor) + Math.max(spare, 0)
  return `${head}${CodeModeInstructions.render(CodeModeCatalog.summarize(runner.inventory, {budget}))}`
}

function chargedCost(floor: CodeModeCatalog.Summary): number {
  return floor.namespaces.reduce(
    (total, namespace) =>
      total +
      CodeModeCatalog.cost(CodeModeCatalog.namespaceLine({...namespace, entries: []})) +
      namespace.entries.reduce((sum, entry) => sum + CodeModeCatalog.cost(entry.line), 0),
    0,
  )
}

function fittedList(items: readonly string[], room: number): string {
  const pieces = items.map((item, index) => (index === 0 ? item : `${NAME_SEPARATOR}${item}`))
  const all = pieces.join('')
  if (all.length <= room) return all
  const listed = fittingCount(pieces, room - overflowTail(1, items.length).length)
  return `${pieces.slice(0, listed).join('')}${overflowTail(listed, items.length - listed)}`
}

function overflowTail(listed: number, hidden: number): string {
  return `${listed === 0 ? '' : NAME_SEPARATOR}and ${hidden} more`
}

function fittingCount(pieces: string[], room: number): number {
  return pieces.reduce(
    (fit, piece) =>
      fit.full || fit.length + piece.length > room
        ? {...fit, full: true}
        : {length: fit.length + piece.length, count: fit.count + 1, full: false},
    {length: 0, count: 0, full: false},
  ).count
}

function decodeDeclaredCode(message: string, declaredCodes: ReadonlySet<string>): string | undefined {
  const candidate = DECLARED_ERROR_PREFIX.exec(message)?.[1]
  if (candidate === undefined || !declaredCodes.has(candidate)) return undefined
  return candidate
}

function executeError(result: ExecuteResult, declaredCodes: ReadonlySet<string>): CodeExecuteError {
  const message = result.error?.message ?? 'execution failed'
  const code = decodeDeclaredCode(message, declaredCodes)
  return {
    message,
    ...(result.error?.name === undefined ? {} : {name: result.error.name}),
    ...(code === undefined ? {} : {code}),
  }
}

type PublishChunks = (chunks: readonly ChatEvent[]) => void

type CallTrace = ReturnType<typeof callTrace>

type CallPublisher = {
  publish: PublishChunks
  settle: () => Promise<void>
  trace: CallTrace
  run: {threadId: string; live: boolean}
  signal: AbortSignal
}

function replyText(reply: CodeReply): string {
  return reply.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n')
}

async function publishResult(calls: CallPublisher, reply: CodeReply): Promise<void> {
  calls.publish(calls.trace.result(calls.run, replyText(reply), reply.isError === true))
  await calls.settle()
}

async function runExecute(
  runner: CodeSandbox,
  typescriptCode: string,
  calls: CallPublisher,
): Promise<CodeExecuteResult> {
  calls.publish(calls.trace.start(calls.run, EXECUTE_TOOL_NAME, {typescriptCode}))
  const raw = await runner
    .run(typescriptCode, calls.trace.callId, calls.signal)
    .catch((error: unknown) => ({success: false, error: {message: String(error)}}))
  const parsed = ExecuteResultSchema.safeParse(raw)
  const result = parsed.success
    ? parsed.data
    : {success: false, error: {message: 'the sandbox returned an unreadable result'}}
  const typed = typedResult(result, runner.declaredCodes, {queued: [], finished: []})
  await publishResult(calls, codeExecuteReply(typed))
  return typed
}

async function runDirect(tool: CodeTool, input: unknown, calls: CallPublisher): Promise<CodeReply> {
  calls.publish(calls.trace.start(calls.run, tool.name, input))
  const reply: CodeReply = await tool.run(input, calls.trace.callId, calls.signal).then(
    (value) => toolValueReply(value),
    (error: unknown) => ({
      content: [{type: 'text', text: cappedText(safeStringify({error: {message: String(error)}}))}],
      isError: true,
    }),
  )
  await publishResult(calls, reply)
  return reply
}

type McpDeps = {
  codeRunner: (
    sessionId: SessionId,
    publish: (chunk: ChatEvent) => void,
    capabilities?: readonly CodeCapability[],
    outside?: boolean,
  ) => Promise<CodeRunner | null>
  finishedQueues: (sessionId: SessionId, outside: boolean) => PageQueueResult[]
  startedQueues: (sessionId: SessionId, toolCallIds: ReadonlySet<string>) => PageQueueHandle[]
  outsideCapabilities: (sessionId: SessionId) => CodeCapability[]
  admitCall: ChatPlane['admitCall']
  resolveSession: (header: SessionId | null, nativeId: HarnessSessionId | null) => Promise<SessionScope>
  admitOutside: (scope: SessionScope, client: string | null, signal: AbortSignal) => Promise<string | null>
  hubRefusal: (client: string | null) => string | null
  staleness: () => EngineStaleness
}

export type McpVars = {mcp: McpDeps}

function gated<Args>(admit: () => Promise<string | null>, run: (args: Args) => Promise<CodeReply>) {
  return async (args: Args): Promise<CodeReply> => {
    const refusal = await admit()
    if (refusal === null) return run(args)
    return {content: [{type: 'text', text: refusal}], isError: true}
  }
}

type CodeCaller = {trace: CallTrace; outside: boolean; askBeforeCalls: boolean; signal: AbortSignal}

function approvedFirst(
  deps: McpDeps,
  sessionId: SessionId,
  tool: CodeTool,
  publish: (chunk: ChatEvent) => void,
): CodeTool {
  return {
    ...tool,
    run: async (input, parentToolCallId, signal) => {
      const refusal = await deps.admitCall(sessionId, {toolName: tool.name, input, publish})
      if (refusal !== null) throw new Error(refusal.message)
      return tool.run(input, parentToolCallId, signal)
    },
  }
}

function withFinishedQueues(reply: CodeReply, finished: readonly PageQueueResult[]): CodeReply {
  if (finished.length === 0) return reply
  const notices = finished.map((result): CodeReplyContent => ({type: 'text', text: cappedText(queueNotice(result))}))
  return {...reply, content: [...notices, ...reply.content]}
}

type CodeRun = {result: CodeExecuteResult; reply: CodeReply}

export type CodeSandboxSession = {
  sandbox: CodeSandbox
  describe: () => CodeDescriptions
  execute: (typescriptCode: string) => Promise<CodeRun>
  discover: (toolNames: string[]) => Promise<CodeDiscoverResult>
}

export type CodeSession = {
  runner: CodeRunner
  sandbox: CodeSandboxSession | null
  asked: (tool: CodeTool, input: unknown) => Promise<CodeReply>
  direct: (tool: CodeTool, input: unknown) => Promise<CodeReply>
}

export async function openCodeSession(
  deps: McpDeps,
  scope: SessionScope,
  caller: CodeCaller,
): Promise<CodeSession | null> {
  const hub = caller.trace.hub !== null
  const run = {threadId: scope.id, live: await scope.run.live()}
  const mirror = caller.trace.mirror(run, {publish: scope.stream.publish, record: scope.run.record})
  const childCalls = new Set<string>()
  const publish = (chunk: ChatEvent): void => {
    if (chunk.type === ChatEventType.TOOL_CALL_START) childCalls.add(chunk.toolCallId)
    mirror.publish([caller.trace.mark(chunk)])
  }
  const runner = await deps.codeRunner(
    scope.id,
    publish,
    hub && caller.outside ? deps.outsideCapabilities(scope.id) : undefined,
    hub,
  )
  if (runner === null) return null
  const calls: CallPublisher = {
    publish: mirror.publish,
    settle: mirror.settle,
    trace: caller.trace,
    run,
    signal: caller.signal,
  }
  const finished = (): PageQueueResult[] => (caller.signal.aborted ? [] : deps.finishedQueues(scope.id, hub))
  const sandbox = (code: CodeSandbox): CodeSandboxSession => ({
    sandbox: code,
    describe: () => ({
      execute: executeDescription(code, deps.staleness()),
      discover: code.discover?.description ?? null,
    }),
    execute: async (typescriptCode) => {
      const executed = await runExecute(code, typescriptCode, calls)
      const started = deps.startedQueues(scope.id, childCalls)
      const delivered = finished()
      const finishedIds = new Set(delivered.map((result) => result.queueId))
      const result = {
        ...executed,
        queued: started.filter((handle) => !finishedIds.has(handle.queueId)),
        finished: delivered,
      }
      return {result, reply: codeExecuteReply(result)}
    },
    discover: async (toolNames) => {
      if (code.discover === null) throw new Error('no tools to discover')
      const tools = cappedValue(await code.discover.run(toolNames))
      return {tools, finished: finished()}
    },
  })
  return {
    runner,
    sandbox: runner.code === null ? null : sandbox(runner.code),
    asked: async (tool, input) => {
      const asking = caller.askBeforeCalls ? approvedFirst(deps, scope.id, tool, publish) : tool
      return withFinishedQueues(await runDirect(asking, input, calls), finished())
    },
    direct: async (tool, input) => withFinishedQueues(await runDirect(tool, input, calls), finished()),
  }
}

type Delivery = Pick<CodeExecuteResult, 'queued' | 'finished'>

function typedResult(result: ExecuteResult, declaredCodes: ReadonlySet<string>, delivery: Delivery): CodeExecuteResult {
  const logs = cappedLogs(result.logs ?? [])
  const files = result.files === undefined ? {} : {files: result.files}
  if (result.success) return {ok: true, result: cappedValue(result.result), logs, ...files, ...delivery}
  const error = executeError(result, declaredCodes)
  return {ok: false, error: {...error, message: cappedText(error.message)}, logs, ...files, ...delivery}
}

function cappedLogs(logs: string[]): string[] {
  const body = safeStringify(logs)
  const capped = cappedText(body)
  return capped === body ? logs : [capped]
}

async function sessionTools(deps: McpDeps, scope: SessionScope, caller: CodeCaller) {
  const origin = caller.trace.hub
  const admit = async (): Promise<string | null> => {
    if (origin === null) return null
    const refusal = deps.hubRefusal(origin.client)
    if (refusal !== null || caller.outside) return refusal
    return (await deps.admitOutside(scope, origin.client, caller.signal)) ?? deps.hubRefusal(origin.client)
  }
  const code = await openCodeSession(deps, scope, caller)
  if (code === null) {
    logError('[mcp] code mode is unavailable (no isolate driver or an empty registry); no tools registered')
    return []
  }
  const sandbox = code.sandbox
  const discover = code.runner.code?.discover ?? null
  const discoverTools =
    sandbox === null || discover === null
      ? []
      : [
          defineTool({
            name: DISCOVER_TOOL_NAME,
            description: discover.description,
            inputSchema: DiscoverInputSchema,
          }).server(gated(admit, async (args) => codeDiscoverReply(await sandbox.discover(args.toolNames)))),
        ]
  const askingTools = code.runner.asking.map((tool) =>
    defineTool({name: tool.name, description: tool.description, inputSchema: tool.inputSchema}).server(
      gated(admit, (args) => code.asked(tool, args)),
    ),
  )
  const directTools = code.runner.direct.map((tool) =>
    defineTool({name: tool.name, description: tool.description, inputSchema: tool.inputSchema}).server(
      gated(admit, (args) => code.direct(tool, args)),
    ),
  )
  const executeTools =
    sandbox === null
      ? []
      : [
          defineTool({
            name: EXECUTE_TOOL_NAME,
            description: sandbox.describe().execute,
            inputSchema: ExecuteInputSchema,
          }).server(
            gated(admit, async (args) => {
              try {
                return (await sandbox.execute(args.typescriptCode)).reply
              } catch (error) {
                logError(`[mcp] ${EXECUTE_TOOL_NAME} failed outside the sandbox: ${String(error)}`)
                throw error
              }
            }),
          ),
        ]
  return [...discoverTools, ...askingTools, ...directTools, ...executeTools]
}

const app = new Hono<{Variables: McpVars}>().post('/', async (c) => {
  if (loopbackHostAllowlist(c.req.header('host') ?? null).length === 0) return c.text('forbidden host', 403)
  const header = sessionIdFromHeaders(c.req.raw.headers)
  const nativeId = nativeIdFromHeaders(c.req.raw.headers)
  const trace = callTrace((name) => c.req.raw.headers.get(name))
  const scope = await c.var.mcp.resolveSession(header, nativeId)
  const caller = {
    trace,
    outside: trace.hub !== null && header === null && nativeId === null,
    askBeforeCalls: trace.hub === null && (header !== null || nativeId === null),
    signal: c.req.raw.signal,
  }
  const server = createMCPServer({
    name: 'conciv',
    version: corePackage.version,
    tools: await sessionTools(c.var.mcp, scope, caller),
    onerror: (error) => logError(`[mcp] ${error.message}`),
  })
  return server.handle(c.req.raw)
})

export default app
