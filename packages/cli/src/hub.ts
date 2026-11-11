import {once} from 'node:events'
import {z} from 'zod'
import {command, description, name, option, schema} from '@bomb.sh/router'
import {createMCPClient, type MCPClient} from '@tanstack/ai-mcp'
import {createMCPServer, type McpServer} from '@tanstack/ai-mcp/server'
import {serveMCPStdio} from '@tanstack/ai-mcp/server/stdio'
import {checkEngines, concivHome, type EngineRow} from '@conciv/db'
import {defineTool} from '@conciv/protocol/chat-tool-types'
import {
  CONCIV_CLIENT_HEADER,
  CONCIV_ORIGIN_HEADER,
  CONCIV_SESSION_HEADER,
  SessionId,
  TabOpenSchema,
  type TabOpen,
} from '@conciv/protocol/chat-types'
import type {InitHarnessId} from '@conciv/protocol/harness-types'
import {HubAgentSchema} from './hub-agent.js'
import cliManifest from '../package.json' with {type: 'json'}
import type {CliOutcome} from './envelope.js'
import {handler} from './router/handler.js'

const EXECUTE_TOOL_NAME = 'execute_typescript'

const DISCOVER_TOOL_NAME = 'discover_tools'

const PROBE_MS = 300

const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks'

const CLIENT_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities'

const TASK_POLL_MS = 1000

const UNKNOWN_TASK = -32602

const TOO_OLD = 'engine too old; upgrade its @conciv packages'

const TabInputSchema = SessionId.optional().describe(
  "The conciv tab this call acts on. List the open tabs with external_tabs({}) in a call without tab, match the user's words against project, branch, root, href, pageTitle and sessionTitle, then pass that tab's id as tab on every execute_typescript and discover_tools call. Leave it out only to call external_tabs({}).",
)

const ExecuteInputSchema = z.object({
  typescriptCode: z
    .string()
    .describe(
      'TypeScript to run in the sandbox. Call capabilities as async sandbox functions, discover them with the `discover_tools` tool, and return a value to pass results back.',
    ),
  tab: TabInputSchema,
})

const DiscoverInputSchema = z.object({toolNames: z.array(z.string()), tab: TabInputSchema})

const RefusedSchema = z.object({cause: z.object({code: z.literal('ECONNREFUSED')})})

const ErrorReplySchema = z.object({isError: z.literal(true)})

const QueueHandleSchema = z.object({result: z.strictObject({queueId: z.string(), actions: z.number()})})

const QueueWaitSchema = z.object({result: z.looseObject({queueId: z.string(), status: z.string()})})

const TasksCapableSchema = z.object({
  [CLIENT_CAPABILITIES]: z.object({extensions: z.object({[TASKS_EXTENSION]: z.unknown()})}),
})

const TaskIdParamsSchema = z.object({taskId: z.string().min(1)})

const TaskRequestSchema = z.object({params: TaskIdParamsSchema})

const FALLBACK_DESCRIPTIONS = {
  [EXECUTE_TOOL_NAME]:
    'Run TypeScript in the sandbox of a running conciv dev server. Every capability is an async external_* function. external_tabs({}) lists the open conciv tabs (live pages running the conciv widget); pick the one the user means and pass its id as tab on every execute_typescript and discover_tools call. Return a value to pass results back.',
  [DISCOVER_TOOL_NAME]:
    'Typed signatures for the named external_* capabilities of execute_typescript; pass the same tab as on execute_typescript.',
}

type ToolName = keyof typeof FALLBACK_DESCRIPTIONS

type Runner = {root: string; client: MCPClient}

type CallResult = Awaited<ReturnType<MCPClient['callTool']>>

type Reply = {content: {type: 'text'; text: string}[]; isError: true}

type Probed = Pick<EngineRow, 'root' | 'apiBase'>

type TabOwner = {root: string; apiBase: string; instructions: string | null; client: MCPClient}

type TabEntry = {owner: Promise<TabOwner> | null; greeted: boolean}

type QueueTask = {tab: SessionId; createdAt: string; lastUpdatedAt: string; reply: CallResult}

async function runHub(env: NodeJS.ProcessEnv, agent: InitHarnessId): Promise<CliOutcome> {
  const home = concivHome({env})
  const held: {runner: Promise<Runner> | null} = {runner: null}
  const tabs = new Map<SessionId, TabEntry>()
  const queueTasks = new Map<string, QueueTask>()
  const headers = {[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: agent}

  function currentRunner(): Promise<Runner> {
    if (held.runner !== null) return held.runner
    const picking: Promise<Runner> = pickRunner(home, headers).catch((error: unknown) => {
      if (held.runner === picking) held.runner = null
      throw error
    })
    held.runner = picking
    return picking
  }

  async function dropRunner(picked: Promise<Runner>, runner: Runner): Promise<void> {
    if (held.runner !== picked) return
    held.runner = null
    await closeClient(runner)
  }

  async function forward(
    toolName: ToolName,
    input: unknown,
    signal: AbortSignal | undefined,
    resent = false,
  ): Promise<CallResult> {
    const picked = currentRunner()
    const runner = await picked
    try {
      return await runner.client.callTool(toolName, input, {signal})
    } catch (error) {
      await dropRunner(picked, runner)
      if (!resent && RefusedSchema.safeParse(error).success) return forward(toolName, input, signal, true)
      const after = await currentRunner().then(
        (next) => `the next call runs on ${next.root}`,
        () => 'no other conciv dev server is running',
      )
      throw new Error(
        `the call failed on the conciv engine at ${runner.root} (${errorText(error)}); it was not retried, since the block may already have acted on a page; ${after}`,
        {cause: error},
      )
    }
  }

  function entryOf(tab: SessionId): TabEntry {
    const existing = tabs.get(tab)
    if (existing !== undefined) return existing
    const created: TabEntry = {owner: null, greeted: false}
    tabs.set(tab, created)
    return created
  }

  async function forget(entry: TabEntry, kept: Promise<TabOwner>, owner: TabOwner): Promise<void> {
    if (entry.owner !== kept) return
    entry.owner = null
    await closeClient(owner)
  }

  async function onTab(
    toolName: ToolName,
    input: unknown,
    tab: SessionId,
    signal: AbortSignal | undefined,
    resent = false,
  ): Promise<CallResult> {
    const entry = entryOf(tab)
    const kept = (entry.owner ??= findOwner(home, tab, {...headers, [CONCIV_SESSION_HEADER]: tab}))
    const owner = await kept.catch((error: unknown) => {
      if (entry.owner === kept) entry.owner = null
      throw error
    })
    try {
      const reply = await owner.client.callTool(toolName, input, {signal})
      if (ErrorReplySchema.safeParse(reply).success && !(await holdsTab(owner, tab))) {
        await forget(entry, kept, owner)
      }
      return greeted(entry, owner, reply)
    } catch (error) {
      await forget(entry, kept, owner)
      if (!resent && RefusedSchema.safeParse(error).success) return onTab(toolName, input, tab, signal, true)
      throw new Error(
        `the call on tab ${tab} failed on the conciv engine at ${owner.root} (${errorText(error)}); it was not retried, since the block may already have acted on a page; the next call looks up the engine holding the tab again`,
        {cause: error},
      )
    }
  }

  function routed(toolName: ToolName) {
    return async (
      {tab: given, ...input}: {tab?: string | undefined},
      context?: {abortSignal?: AbortSignal},
    ): Promise<CallResult> => {
      const tab = TabInputSchema.parse(given)
      const signal = context?.abortSignal
      const call = tab === undefined ? forward(toolName, input, signal) : onTab(toolName, input, tab, signal)
      return call.catch((error: unknown) => failed(errorText(error)))
    }
  }

  async function executeCall(
    input: z.infer<typeof ExecuteInputSchema>,
    envelope: unknown,
    abortSignal: AbortSignal,
  ): Promise<CallResult> {
    const reply = await routed(EXECUTE_TOOL_NAME)(input, {abortSignal})
    if (input.tab === undefined || !TasksCapableSchema.safeParse(envelope).success) return reply
    const queueId = reply.isError === true ? undefined : queueHandleIn(reply)
    if (queueId === undefined) return reply
    const now = new Date().toISOString()
    queueTasks.set(queueId, {tab: input.tab, createdAt: now, lastUpdatedAt: now, reply})
    return {
      content: [],
      resultType: 'task',
      taskId: queueId,
      status: 'working',
      createdAt: now,
      lastUpdatedAt: now,
      ttlMs: null,
      pollIntervalMs: TASK_POLL_MS,
    }
  }

  async function queueTask(params: unknown): Promise<Record<string, unknown>> {
    const {taskId} = TaskIdParamsSchema.parse(params)
    const task = queueTasks.get(taskId)
    if (task === undefined) throw Object.assign(new Error(`no queue task ${taskId}`), {code: UNKNOWN_TASK})
    const typescriptCode = `return await external_page_queue_wait({queueId: ${JSON.stringify(taskId)}, waitMs: 0})`
    const reply = await onTab(EXECUTE_TOOL_NAME, {typescriptCode}, task.tab, undefined).catch((error: unknown) =>
      failed(errorText(error)),
    )
    const waited = reply.isError === true ? undefined : queueWaitIn(reply)
    const stamped = {taskId, createdAt: task.createdAt, ttlMs: null}
    if (waited === 'playing') {
      return {
        resultType: 'complete',
        ...stamped,
        status: 'working',
        lastUpdatedAt: task.lastUpdatedAt,
        pollIntervalMs: TASK_POLL_MS,
      }
    }
    const lastUpdatedAt = new Date().toISOString()
    queueTasks.delete(taskId)
    const result =
      waited === undefined
        ? {...reply, isError: true}
        : {...task.reply, content: [...task.reply.content, ...reply.content]}
    return {resultType: 'complete', ...stamped, status: 'completed', lastUpdatedAt, result}
  }

  function serveQueueTasks(server: McpServer): void {
    server.registerTool(
      EXECUTE_TOOL_NAME,
      {description: descriptions[EXECUTE_TOOL_NAME], inputSchema: ExecuteInputSchema},
      async (input, ctx) => executeCall(input, ctx.mcpReq.envelope, ctx.mcpReq.signal),
    )
    server.server.setRequestHandler('tasks/get', {params: TaskIdParamsSchema}, queueTask)
  }

  const startup = currentRunner()
  const descriptions = await startup.then(
    (runner) =>
      startupDescriptions(runner).catch(async (error: unknown) => {
        logHub('reading the runner tool descriptions failed; using the built-in text', error)
        await dropRunner(startup, runner)
        return FALLBACK_DESCRIPTIONS
      }),
    () => FALLBACK_DESCRIPTIONS,
  )
  const server = createMCPServer({
    name: 'conciv-hub',
    version: cliManifest.version,
    sessions: 'memory',
    setup: serveQueueTasks,
    tools: [
      defineTool({
        name: DISCOVER_TOOL_NAME,
        description: descriptions[DISCOVER_TOOL_NAME],
        inputSchema: DiscoverInputSchema,
      }).server(routed(DISCOVER_TOOL_NAME)),
    ],
  })
  const served = serveMCPStdio({...server, fetch: async (request) => server.fetch(await withTaskName(request))})
  await once(process.stdin, 'end')
  await served.close()
  await Promise.all([held.runner, ...[...tabs.values()].map((entry) => entry.owner)].map(closeHeld))
  return {report: 'none', code: 0}
}

const ServeModelSchema = z.object({agent: HubAgentSchema})

export const serveCommand = command(
  name('serve'),
  description('Serve conciv to an outside agent over MCP stdio, through the running conciv dev server.'),
  option(
    name('agent'),
    description('the agent this server answers for (claude, codex, gemini-cli, opencode)'),
    schema(HubAgentSchema),
  ),
  handler((model) => runHub(process.env, ServeModelSchema.parse(model).agent)),
)

async function pickRunner(home: string, headers: Record<string, string>): Promise<Runner> {
  const checked = await liveEngines(home)
  const row = checked.live[0]
  if (row === undefined) {
    throw new Error(`no conciv dev server is running; start one and open its page (conciv home folder read: ${home})`)
  }
  return {root: row.root, client: await connect(row, headers)}
}

async function startupDescriptions(runner: Runner): Promise<Record<ToolName, string>> {
  const tools = await runner.client.tools()
  const described = (tool: ToolName) =>
    tools.find((entry) => entry.name === tool)?.description ?? FALLBACK_DESCRIPTIONS[tool]
  return {[EXECUTE_TOOL_NAME]: described(EXECUTE_TOOL_NAME), [DISCOVER_TOOL_NAME]: described(DISCOVER_TOOL_NAME)}
}

async function findOwner(home: string, tab: SessionId, headers: Record<string, string>): Promise<TabOwner> {
  const checked = await liveEngines(home)
  const probes = await Promise.allSettled(checked.live.map(async (row) => ({row, answer: await tabAnswer(row, tab)})))
  const answered = probes.flatMap((probe) => (probe.status === 'fulfilled' ? [probe.value] : []))
  const [only, second] = answered.filter(({answer}) => answer.open)
  const failures = probes.flatMap((probe) => (probe.status === 'rejected' ? [probe.reason] : []))
  if (only === undefined) throw notOpen(tab, failures)
  if (second !== undefined) {
    throw new Error(
      `tab ${tab} is open on two conciv engines (${only.row.root} and ${second.row.root}); ask the user to close one of the browser tabs`,
    )
  }
  const client = await connect(only.row, headers)
  return {root: only.row.root, apiBase: only.row.apiBase, instructions: only.answer.instructions, client}
}

function notOpen(tab: SessionId, failures: unknown[]): Error {
  if (failures.length === 0) return new Error(`TAB_NOT_OPEN: tab ${tab} is not open; call external_tabs({})`)
  return new Error(
    `cannot tell whether tab ${tab} is open: no engine that answered has it, and the tab probe failed on ${failures.map(errorText).join('; ')}; nothing ran`,
    {cause: new AggregateError(failures, 'the tab probes failed')},
  )
}

function liveEngines(home: string): ReturnType<typeof checkEngines> {
  return checkEngines(home, {timeoutMs: PROBE_MS}).catch((error: unknown) => {
    throw new Error(`cannot read the conciv home folder ${home}: ${errorText(error)}`, {cause: error})
  })
}

function connect(row: EngineRow, headers: Record<string, string>): Promise<MCPClient> {
  return createMCPClient({transport: {type: 'http', url: `${row.apiBase}/api/mcp`, headers}, name: 'conciv-hub'}).catch(
    (error: unknown) => {
      throw new Error(`connecting to the conciv engine at ${row.root} failed (${errorText(error)}); nothing ran`, {
        cause: error,
      })
    },
  )
}

async function tabAnswer(engine: Probed, tab: SessionId): Promise<TabOpen> {
  const response = await fetch(`${engine.apiBase}/api/tabs?session=${tab}`, {
    signal: AbortSignal.timeout(PROBE_MS),
  }).catch(probeFailed(engine))
  if (response.status === 404) throw new Error(`${engine.root} (${TOO_OLD})`)
  if (!response.ok) throw new Error(`${engine.root} (/api/tabs answered HTTP ${response.status})`)
  const answer = TabOpenSchema.safeParse(await response.json().catch(probeFailed(engine)))
  if (!answer.success) throw new Error(`${engine.root} (${TOO_OLD})`, {cause: answer.error})
  return answer.data
}

function probeFailed(engine: Probed) {
  return (error: unknown): never => {
    throw new Error(`${engine.root} (${errorText(error)})`, {cause: error})
  }
}

async function holdsTab(owner: TabOwner, tab: SessionId): Promise<boolean> {
  return tabAnswer(owner, tab).then(
    (answer) => answer.open,
    (error: unknown) => {
      logHub(`checking whether tab ${tab} is still open failed; the next call looks up its engine again`, error)
      return false
    },
  )
}

function greeted(entry: TabEntry, owner: TabOwner, reply: CallResult): CallResult {
  if (entry.greeted) return reply
  entry.greeted = true
  if (owner.instructions === null) return reply
  return {...reply, content: [{type: 'text', text: owner.instructions}, ...reply.content]}
}

async function withTaskName(request: Request): Promise<Request> {
  if (!request.headers.get('mcp-method')?.startsWith('tasks/') || request.headers.has('mcp-name')) return request
  const body = await request.text()
  const taskId = TaskRequestSchema.safeParse(parsedText(body)).data?.params.taskId
  const headers = new Headers(request.headers)
  if (taskId !== undefined) headers.set('mcp-name', taskId)
  return new Request(request.url, {method: request.method, headers, body, signal: request.signal})
}

function textsOf(reply: CallResult): string[] {
  return reply.content.flatMap((part) => (part.type === 'text' ? [part.text] : []))
}

function parsedText(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

function queueHandleIn(reply: CallResult): string | undefined {
  return textsOf(reply)
    .map((text) => QueueHandleSchema.safeParse(parsedText(text)))
    .find((handle) => handle.success)?.data?.result.queueId
}

function queueWaitIn(reply: CallResult): string | undefined {
  return textsOf(reply)
    .map((text) => QueueWaitSchema.safeParse(parsedText(text)))
    .find((waited) => waited.success)?.data?.result.status
}

async function closeHeld(held: Promise<Runner> | null): Promise<void> {
  await held?.then(closeClient, () => undefined)
}

async function closeClient(owner: Runner): Promise<void> {
  await owner.client
    .close()
    .catch((error: unknown) => logHub(`closing the client of the conciv engine at ${owner.root} failed`, error))
}

function failed(text: string): Reply {
  return {content: [{type: 'text', text}], isError: true}
}

function logHub(message: string, error: unknown): void {
  process.stderr.write(`conciv mcp: ${message}: ${errorText(error)}\n`)
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
