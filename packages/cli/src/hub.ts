import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {z} from 'zod'
import {command, description, name, option, schema} from '@bomb.sh/router'
import {ORPCError} from '@orpc/client'
import {createMCPServer, type McpServer} from '@tanstack/ai-mcp/server'
import {serveMCPStdio} from '@tanstack/ai-mcp/server/stdio'
import {checkEngines, concivHome, type EngineRow} from '@conciv/db'
import {
  engineTooOld,
  makeRpcClient,
  type CodeDescriptions,
  type CodeExecuteResult,
  type RpcClient,
} from '@conciv/contract'
import {CONCIV_CLIENT_HEADER, CONCIV_ORIGIN_HEADER, SessionId, type TabOpen} from '@conciv/protocol/chat-types'
import {
  imageBlocks,
  imagesIn,
  isContentParts,
  withoutImages,
  type ContentPart,
} from '@conciv/protocol/chat-message-types'
import type {PageQueueHandle, PageQueueProgress, PageQueueResult} from '@conciv/protocol/page-types'
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

type Content = {type: 'text'; text: string} | {type: 'image'; data: string; mimeType: string}

type Reply = {content: Content[]; isError?: true}

type Runner = {root: string; rpc: RpcClient; described: CodeDescriptions | null}

type TabOwner = {root: string; apiBase: string; instructions: string | null; rpc: RpcClient}

type TabEntry = {owner: Promise<TabOwner> | null; greeted: boolean}

type QueueTask = {tab: SessionId; queued: PageQueueHandle[]; createdAt: string; lastUpdatedAt: string; reply: Reply}

type GoneQueue = {queueId: string; status: 'gone'}

type PolledQueue = PageQueueResult | PageQueueProgress | GoneQueue

type EngineCall<Value> = (rpc: RpcClient, signal: AbortSignal | undefined) => Promise<Value>

type TaskReply = {
  content: Content[]
  resultType: 'task'
  taskId: string
  status: 'working'
  createdAt: string
  lastUpdatedAt: string
  ttlMs: null
  pollIntervalMs: number
}

type Routed<Value> = {reply: Reply; value: Value | null}

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

  function dropRunner(picked: Promise<Runner>): void {
    if (held.runner === picked) held.runner = null
  }

  async function forward<Value>(
    call: EngineCall<Value>,
    format: (value: Value) => Reply,
    signal: AbortSignal | undefined,
    resent = false,
  ): Promise<Routed<Value>> {
    const picked = currentRunner()
    const runner = await picked
    try {
      const value = await call(runner.rpc, signal)
      return {reply: format(value), value}
    } catch (error) {
      if (answered(error)) return {reply: failed(answerText(runner.root, error)), value: null}
      dropRunner(picked)
      if (!resent && RefusedSchema.safeParse(error).success) return forward(call, format, signal, true)
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

  function forget(entry: TabEntry, kept: Promise<TabOwner>): void {
    if (entry.owner === kept) entry.owner = null
  }

  async function onTab<Value>(
    tab: SessionId,
    call: EngineCall<Value>,
    format: (value: Value) => Reply,
    signal: AbortSignal | undefined,
    resent = false,
  ): Promise<Routed<Value>> {
    const entry = entryOf(tab)
    const kept = (entry.owner ??= findOwner(home, tab, headers))
    const owner = await kept.catch((error: unknown) => {
      forget(entry, kept)
      throw error
    })
    try {
      const value = await call(owner.rpc, signal)
      return {reply: greeted(entry, owner, format(value)), value}
    } catch (error) {
      if (answered(error)) {
        if (!(await holdsTab(owner, tab))) forget(entry, kept)
        return {reply: greeted(entry, owner, failed(answerText(owner.root, error))), value: null}
      }
      forget(entry, kept)
      if (!resent && RefusedSchema.safeParse(error).success) return onTab(tab, call, format, signal, true)
      throw new Error(
        `the call on tab ${tab} failed on the conciv engine at ${owner.root} (${errorText(error)}); it was not retried, since the block may already have acted on a page; the next call looks up the engine holding the tab again`,
        {cause: error},
      )
    }
  }

  async function routed<Value>(
    tab: SessionId | undefined,
    call: EngineCall<Value>,
    format: (value: Value) => Reply,
    signal: AbortSignal | undefined,
  ): Promise<Routed<Value>> {
    const sent = tab === undefined ? forward(call, format, signal) : onTab(tab, call, format, signal)
    return sent.catch((error: unknown) => ({reply: failed(errorText(error)), value: null}))
  }

  async function executeCall(
    input: z.infer<typeof ExecuteInputSchema>,
    envelope: unknown,
    signal: AbortSignal,
  ): Promise<Reply | TaskReply> {
    const tab = TabInputSchema.parse(input.tab)
    const typescriptCode = input.typescriptCode
    const executed = await routed(
      tab,
      (rpc, aborted) => rpc.code.execute({...sessionOf(tab), typescriptCode}, {signal: aborted}),
      executeReply,
      signal,
    )
    const queued = executed.value?.queued ?? []
    if (tab === undefined || queued.length === 0 || !TasksCapableSchema.safeParse(envelope).success) {
      return executed.reply
    }
    const taskId = randomUUID()
    const now = new Date().toISOString()
    queueTasks.set(taskId, {tab, queued, createdAt: now, lastUpdatedAt: now, reply: executed.reply})
    return {
      content: [],
      resultType: 'task',
      taskId,
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
    const polled = await Promise.all(
      task.queued.map(async ({queueId}) => {
        const waited = await routed(
          task.tab,
          (rpc, aborted) => pollQueue(rpc, task.tab, queueId, aborted),
          () => ({content: []}),
          undefined,
        )
        return waited.value
      }),
    )
    const settled = polled.flatMap((state) => (state === null || state.status === 'playing' ? [] : [state]))
    const stamped = {taskId, createdAt: task.createdAt, ttlMs: null}
    if (settled.length < task.queued.length) {
      return {
        resultType: 'complete',
        ...stamped,
        status: 'working',
        lastUpdatedAt: task.lastUpdatedAt,
        pollIntervalMs: TASK_POLL_MS,
      }
    }
    queueTasks.delete(taskId)
    const notices = settled.map((state) => (state.status === 'gone' ? goneNotice(state) : queueNotice(state)))
    const lastUpdatedAt = new Date().toISOString()
    if (settled.every((state) => state.status !== 'gone')) {
      const result = {...task.reply, content: [...task.reply.content, ...notices]}
      return {resultType: 'complete', ...stamped, status: 'completed', lastUpdatedAt, result}
    }
    const statusMessage = notices.map((notice) => notice.text).join('\n\n')
    return {resultType: 'complete', ...stamped, status: 'failed', lastUpdatedAt, statusMessage}
  }

  async function discoverCall(input: z.infer<typeof DiscoverInputSchema>, signal: AbortSignal): Promise<Reply> {
    const tab = TabInputSchema.parse(input.tab)
    const toolNames = input.toolNames
    const discovered = await routed(
      tab,
      (rpc, aborted) => rpc.code.discover({...sessionOf(tab), toolNames}, {signal: aborted}),
      (value) => ({content: [{type: 'text', text: JSON.stringify(value) ?? 'null'}]}),
      signal,
    )
    return discovered.reply
  }

  function serveQueueTasks(server: McpServer): void {
    server.registerTool(
      EXECUTE_TOOL_NAME,
      {description: descriptions[EXECUTE_TOOL_NAME], inputSchema: ExecuteInputSchema},
      async (input, ctx) => executeCall(input, ctx.mcpReq.envelope, ctx.mcpReq.signal),
    )
    server.registerTool(
      DISCOVER_TOOL_NAME,
      {description: descriptions[DISCOVER_TOOL_NAME], inputSchema: DiscoverInputSchema},
      async (input, ctx) => discoverCall(input, ctx.mcpReq.signal),
    )
    server.server.setRequestHandler('tasks/get', {params: TaskIdParamsSchema}, queueTask)
  }

  const descriptions: Record<ToolName, string> = {...FALLBACK_DESCRIPTIONS}
  void currentRunner()
    .then(
      (runner) => toolDescriptions(runner.described),
      () => FALLBACK_DESCRIPTIONS,
    )
    .then((described) => Object.assign(descriptions, described))
  const server = createMCPServer({
    name: 'conciv-hub',
    version: cliManifest.version,
    sessions: 'memory',
    setup: serveQueueTasks,
  })
  const served = serveMCPStdio({...server, fetch: async (request) => server.fetch(await withTaskName(request))})
  await once(process.stdin, 'end')
  await served.close()
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
  if (checked.live.length === 0) {
    throw new Error(`no conciv dev server is running; start one and open its page (conciv home folder read: ${home})`)
  }
  return firstUsable(checked.live, headers, [])
}

async function firstUsable(rows: EngineRow[], headers: Record<string, string>, tooOld: string[]): Promise<Runner> {
  const [row, ...rest] = rows
  if (row === undefined) throw new Error(`no conciv dev server this hub can use is running: ${tooOld.join('; ')}`)
  const probed = await runnerAt(row, headers)
  if ('runner' in probed) return probed.runner
  return firstUsable(rest, headers, [...tooOld, `${probed.tooOld} (${TOO_OLD})`])
}

async function runnerAt(row: EngineRow, headers: Record<string, string>): Promise<{runner: Runner} | {tooOld: string}> {
  const rpc = makeRpcClient(row.apiBase, {headers, validated: true})
  return rpc.code.describe().then(
    (described) => ({runner: {root: row.root, rpc, described}}),
    (error: unknown) => {
      if (engineTooOld(error)) return {tooOld: row.root}
      logHub(`reading the tool descriptions of the conciv engine at ${row.root} failed; using the built-in text`, error)
      return {runner: {root: row.root, rpc, described: null}}
    },
  )
}

function toolDescriptions(described: CodeDescriptions | null): Record<ToolName, string> {
  if (described === null) return FALLBACK_DESCRIPTIONS
  return {
    [EXECUTE_TOOL_NAME]: described.execute,
    [DISCOVER_TOOL_NAME]: described.discover ?? FALLBACK_DESCRIPTIONS[DISCOVER_TOOL_NAME],
  }
}

async function findOwner(home: string, tab: SessionId, headers: Record<string, string>): Promise<TabOwner> {
  const checked = await liveEngines(home)
  const probes = await Promise.allSettled(checked.live.map(async (row) => ({row, answer: await tabAnswer(row, tab)})))
  const answers = probes.flatMap((probe) => (probe.status === 'fulfilled' ? [probe.value] : []))
  const [only, second] = answers.filter(({answer}) => answer.open)
  const failures = probes.flatMap((probe) => (probe.status === 'rejected' ? [probe.reason] : []))
  if (only === undefined) throw notOpen(tab, failures)
  if (second !== undefined) {
    throw new Error(
      `tab ${tab} is open on two conciv engines (${only.row.root} and ${second.row.root}); ask the user to close one of the browser tabs`,
    )
  }
  return {
    root: only.row.root,
    apiBase: only.row.apiBase,
    instructions: only.answer.instructions,
    rpc: makeRpcClient(only.row.apiBase, {headers, validated: true}),
  }
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

async function tabAnswer(engine: Pick<EngineRow, 'root' | 'apiBase'>, tab: SessionId): Promise<TabOpen> {
  return makeRpcClient(engine.apiBase, {validated: true})
    .tabs.get({sessionId: tab}, {signal: AbortSignal.timeout(PROBE_MS)})
    .catch((error: unknown) => {
      throw new Error(`${engine.root} (${engineTooOld(error) ? TOO_OLD : errorText(error)})`, {cause: error})
    })
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

function greeted(entry: TabEntry, owner: TabOwner, reply: Reply): Reply {
  if (entry.greeted) return reply
  entry.greeted = true
  if (owner.instructions === null) return reply
  return {...reply, content: [{type: 'text', text: owner.instructions}, ...reply.content]}
}

function sessionOf(tab: SessionId | undefined): {sessionId?: SessionId} {
  return tab === undefined ? {} : {sessionId: tab}
}

function executeReply(executed: CodeExecuteResult): Reply {
  const notices = executed.finished.map(queueNotice)
  if (!executed.ok) {
    const logs = executed.logs.length === 0 ? {} : {logs: executed.logs}
    return {
      content: [...notices, {type: 'text', text: JSON.stringify({error: executed.error, ...logs})}],
      isError: true,
    }
  }
  return {content: [...notices, ...resultContent(executed.result, executed.logs)]}
}

function resultContent(result: unknown, logs: string[]): Content[] {
  if (!isContentParts(result)) {
    const body = JSON.stringify({result: withoutImages(result ?? null), logs})
    return [{type: 'text', text: body}, ...imageBlocks(imagesIn(result))]
  }
  const logged: Content[] = logs.length === 0 ? [] : [{type: 'text', text: JSON.stringify({logs})}]
  return [...result.map(partContent), ...logged]
}

function partContent(part: ContentPart): Content {
  if (part.type === 'text') return {type: 'text', text: part.content}
  if (part.type === 'image') {
    return {type: 'image', data: part.source.value, mimeType: part.source.mimeType ?? 'application/octet-stream'}
  }
  return {type: 'text', text: JSON.stringify(part)}
}

function queueNotice(result: PageQueueResult): {type: 'text'; text: string} {
  return {
    type: 'text',
    text: `queue ${result.queueId} ${result.status}: ${result.played} played, ${result.failed} failed\n${JSON.stringify(result)}`,
  }
}

async function pollQueue(
  rpc: RpcClient,
  sessionId: SessionId,
  queueId: string,
  signal: AbortSignal | undefined,
): Promise<PolledQueue> {
  try {
    return await rpc.page.queue.wait({sessionId, queueId, waitMs: 0}, {signal})
  } catch (error) {
    if (error instanceof ORPCError && error.code === 'NO_QUEUE') return {queueId, status: 'gone'}
    throw error
  }
}

function goneNotice(gone: GoneQueue): {type: 'text'; text: string} {
  return {
    type: 'text',
    text: `queue ${gone.queueId} was lost: the engine holding the tab no longer has it (it restarted), so its actions may have partly run`,
  }
}

function answered(error: unknown): boolean {
  return error instanceof ORPCError || engineTooOld(error)
}

function answerText(root: string, error: unknown): string {
  return engineTooOld(error) ? `${root} (${TOO_OLD})` : errorText(error)
}

async function withTaskName(request: Request): Promise<Request> {
  if (!request.headers.get('mcp-method')?.startsWith('tasks/') || request.headers.has('mcp-name')) return request
  const body = await request.text()
  const message: unknown = await new Response(body).json().catch(() => null)
  const taskId = TaskRequestSchema.safeParse(message).data?.params.taskId
  const headers = new Headers(request.headers)
  if (taskId !== undefined) headers.set('mcp-name', taskId)
  return new Request(request.url, {method: request.method, headers, body, signal: request.signal})
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
