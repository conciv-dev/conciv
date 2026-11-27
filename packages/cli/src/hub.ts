import {once} from 'node:events'
import {z} from 'zod'
import {log} from 'evlog'
import {differenceBy, partition} from 'es-toolkit'
import {ORPCError} from '@orpc/client'
import {createMCPServer, type McpServer} from '@tanstack/ai-mcp/server'
import {serveMCPStdio} from '@tanstack/ai-mcp/server/stdio'
import {concivHome, type EngineRow} from '@conciv/home'
import {
  cappedText,
  codeDiscoverReply,
  codeExecuteReply,
  contractCode,
  engineErrors,
  type CodeDescriptions,
  type CodeReply,
} from '@conciv/protocol'
import {cliErrors} from './failure.js'
import {engineTooOld, makeRpcClient, type EngineClient} from '@conciv/client'
import {CONCIV_CLIENT_HEADER, CONCIV_ORIGIN_HEADER, SessionId} from '@conciv/types/chat-types'
import type {InitHarnessId} from '@conciv/types/harness-types'
import {makeMaker} from '@conciv/protocol/schema/identifier'
import cliManifest from '../package.json' with {type: 'json'}
import type {CliOutcome} from './envelope.js'
import {
  askAgain,
  askTab,
  askTabs,
  ENGINE_READ_MS,
  errorText,
  homeRead,
  listTabs,
  liveEngines,
  PROBE_MS,
  runningEngines,
  silence,
  TOO_OLD,
  type Silent,
  type TabAsk,
  type TabOpen,
} from './engine-read.js'

const EXECUTE_TOOL_NAME = 'execute_typescript'

const DISCOVER_TOOL_NAME = 'discover_tools'

const LIST_TABS_TOOL_NAME = 'list_tabs'

const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks'

const CLIENT_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities'

const TASK_POLL_MS = 1000

const TASK_TTL_MS = 60 * 60_000

const UNKNOWN_TASK = -32602

const TabInputSchema = SessionId.optional().describe(
  "The conciv tab this call acts on. List the open tabs with list_tabs, match the user's words against project, branch, root, href, pageTitle and sessionTitle, then pass that tab's id as tab on every execute_typescript and discover_tools call.",
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

const ListTabsInputSchema = z.object({})

const LIST_TABS_DESCRIPTION =
  'List the open conciv tabs of every running conciv dev server on this machine. conciv tabs are live web pages running the conciv widget. When the user refers to a conciv tab, session or page in words, call list_tabs and match their words against project, branch, root, href, pageTitle and sessionTitle. If exactly one tab matches, use it and tell the user which one you picked (project, branch, URL). If more than one matches, do not guess: ask the user which one, naming the field that differs. Prefer a tab whose state is visible only when the user says "this one" or "the one I have open". If none match, say so and list what is open. Then pass the id of that tab as tab on every execute_typescript and discover_tools call; the first reply for a tab starts with its instructions, follow them. When a session has more than one browser tab (browserTabs lists each with its href), calls go to the one focused last, which is the first listed; tell the user which one (href). A call into a tab waits until the user approves it in that tab; if it says the user denied you access, stop and tell the user, do not retry. If a call says the tab is not open, call list_tabs again. Dev servers that did not answer are listed under unreachable.'

const RefusedSchema = z.object({cause: z.object({code: z.literal('ECONNREFUSED')})})

const TasksCapableSchema = z.object({
  [CLIENT_CAPABILITIES]: z.object({extensions: z.object({[TASKS_EXTENSION]: z.unknown()})}),
})

const TaskIdSchema = z.string().startsWith('tsk_').brand<'Task.ID'>()

const TaskIdParamsSchema = z.object({taskId: z.string().min(1)})

const TaskRequestSchema = z.object({params: TaskIdParamsSchema})

const FALLBACK_DESCRIPTIONS = {
  [EXECUTE_TOOL_NAME]: `Run TypeScript in the sandbox of a running conciv dev server. Every capability is an async external_* function. list_tabs lists the open conciv tabs (live pages running the conciv widget); pick the one the user means and pass its id as tab on every execute_typescript and discover_tools call. Return a value to pass results back.`,
  [DISCOVER_TOOL_NAME]:
    'Typed signatures for the named external_* capabilities of execute_typescript; pass the same tab as on execute_typescript.',
}

type ToolName = keyof typeof FALLBACK_DESCRIPTIONS

type Waited = Awaited<ReturnType<EngineClient['jobs']['wait']>>['data'][number]

type Reply = CodeReply

type Runner = {root: string; rpc: EngineClient; described: CodeDescriptions | null}

type TabOwner = {
  root: string
  apiBase: string
  token: string
  instructions: string | null
  rpc: EngineClient
}

type TabEntry = {owner: Promise<TabOwner> | null; greeted: boolean; jobs: string[]}

type TaskAnswer = Record<string, unknown>

type JobTask =
  | {
      status: 'working'
      rpc: EngineClient
      jobs: string[]
      finished: Waited[]
      createdAt: string
      lastUpdatedAt: string
      reply: Reply
    }
  | {status: 'settled'; createdAt: string; answer: TaskAnswer}

type EngineCall<Value> = (rpc: EngineClient, signal: AbortSignal | undefined) => Promise<Value>

type TaskReply = {
  content: Reply['content']
  resultType: 'task'
  taskId: string
  status: 'working'
  createdAt: string
  lastUpdatedAt: string
  ttlMs: number
  pollIntervalMs: number
}

type Routed<Value> = {reply: Reply; value: Value | null}

type Candidate = {runner: Runner; unusable: null} | {runner: null; unusable: string}

type Picked = {runner: Runner | null; unusable: string[]}

export async function runHub(env: NodeJS.ProcessEnv, agent: InitHarnessId): Promise<CliOutcome> {
  const home = concivHome({env})
  const ids = makeMaker()
  const held: {runner: Promise<Runner> | null} = {runner: null}
  const tabs = new Map<SessionId, TabEntry>()
  const jobTasks = new Map<string, JobTask>()
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
      if (!resent && unrun(error)) {
        dropRunner(picked)
        return forward(call, format, signal, true)
      }
      if (answered(error)) return {reply: failed(answerText(runner.root, error)), value: null}
      dropRunner(picked)
      const after = await currentRunner().then(
        (next) => `the next call runs on ${next.root}`,
        () => 'no other conciv dev server is running',
      )
      throw cliErrors.CALL_FAILED({
        root: runner.root,
        reason: errorText(error),
        after,
        ...(error instanceof Error ? {cause: error} : {}),
      })
    }
  }

  function ensureEntry(tab: SessionId): TabEntry {
    const existing = tabs.get(tab)
    if (existing !== undefined) return existing
    const created: TabEntry = {owner: null, greeted: false, jobs: []}
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
    const entry = ensureEntry(tab)
    const kept = (entry.owner ??= findOwner(home, tab, headers))
    const owner = await kept.catch((error: unknown) => {
      forget(entry, kept)
      throw error
    })
    try {
      const value = await call(owner.rpc, signal)
      return {reply: greeted(entry, owner, format(value)), value}
    } catch (error) {
      if (!resent && unrun(error)) {
        forget(entry, kept)
        return onTab(tab, call, format, signal, true)
      }
      if (answered(error)) {
        if (!(await holdsTab(owner, tab))) forget(entry, kept)
        return {reply: greeted(entry, owner, failed(answerText(owner.root, error))), value: null}
      }
      forget(entry, kept)
      throw cliErrors.TAB_CALL_FAILED({
        tab,
        root: owner.root,
        reason: errorText(error),
        ...(error instanceof Error ? {cause: error} : {}),
      })
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
      (rpc, aborted) => rpc.code.execute({...buildSessionInput(tab), typescriptCode}, {signal: aborted}),
      codeExecuteReply,
      signal,
    )
    if (tab === undefined) return executed.reply
    const entry = ensureEntry(tab)
    const owner = await entry.owner?.catch(() => null)
    if (owner === undefined || owner === null) return executed.reply
    const started = await startedJobs(owner.rpc, tab, executed.value?.calls ?? [], signal)
    const finished = await reportedJobs(owner.rpc, entry, [...entry.jobs, ...started], signal)
    const reply = withFinished(executed.reply, finished)
    const running = started.filter((id) => entry.jobs.includes(id))
    if (running.length === 0 || !TasksCapableSchema.safeParse(envelope).success) return reply
    entry.jobs = entry.jobs.filter((id) => !running.includes(id))
    const taskId = TaskIdSchema.parse('tsk_' + ids.ascending())
    const now = new Date().toISOString()
    jobTasks.set(taskId, {
      status: 'working',
      rpc: owner.rpc,
      jobs: running,
      finished: [],
      createdAt: now,
      lastUpdatedAt: now,
      reply,
    })
    return {
      content: [],
      resultType: 'task',
      taskId,
      status: 'working',
      createdAt: now,
      lastUpdatedAt: now,
      ttlMs: TASK_TTL_MS,
      pollIntervalMs: TASK_POLL_MS,
    }
  }

  function expireTasks(): void {
    const expired = Date.now() - TASK_TTL_MS
    for (const [taskId, task] of jobTasks) {
      if (Date.parse(task.createdAt) < expired) jobTasks.delete(taskId)
    }
  }

  async function startedJobs(
    rpc: EngineClient,
    tab: SessionId,
    calls: string[],
    signal: AbortSignal,
  ): Promise<string[]> {
    if (calls.length === 0 || signal.aborted) return []
    return rpc.jobs.list({sessionId: tab, toolCallIds: calls}, {signal}).then(
      (listed) => listed.data.map((job) => job.id),
      (error: unknown) => {
        logHub(`listing the jobs the calls on tab ${tab} started failed; their results are not reported`, error)
        return []
      },
    )
  }

  async function reportedJobs(
    rpc: EngineClient,
    entry: TabEntry,
    owed: string[],
    signal: AbortSignal,
  ): Promise<Waited[]> {
    entry.jobs = owed
    if (owed.length === 0 || signal.aborted) return []
    const waited = await rpc.jobs.wait({ids: owed, waitMs: 0}, {signal}).catch((error: unknown) => {
      logHub('reading the jobs owed to this hub failed; the next call asks again', error)
      return null
    })
    if (waited === null) return []
    const stillRunning = waited.data.filter((job) => job.status === 'running').map((job) => job.id)
    entry.jobs = entry.jobs.filter((id) => stillRunning.includes(id))
    return waited.data.filter((job) => job.status !== 'running')
  }

  function knownTask(taskId: string): JobTask {
    expireTasks()
    const task = jobTasks.get(taskId)
    if (task === undefined) throw Object.assign(new Error(`no job task ${taskId}`), {code: UNKNOWN_TASK})
    return task
  }

  async function jobTask(params: unknown): Promise<TaskAnswer> {
    const {taskId} = TaskIdParamsSchema.parse(params)
    const task = knownTask(taskId)
    if (task.status === 'settled') return task.answer
    const polled = await task.rpc.jobs
      .wait({ids: task.jobs, waitMs: TASK_POLL_MS}, {signal: AbortSignal.timeout(2 * TASK_POLL_MS)})
      .catch((error: unknown) => {
        logHub(`polling the jobs of task ${taskId} failed; the next poll asks again`, error)
        return null
      })
    const current = knownTask(taskId)
    if (current.status === 'settled') return current.answer
    const running = polled?.data.filter((job) => job.status === 'running').map((job) => job.id) ?? current.jobs
    const finished = [...current.finished, ...(polled?.data.filter((job) => job.status !== 'running') ?? [])]
    const stamped = {taskId, createdAt: current.createdAt, ttlMs: TASK_TTL_MS}
    if (running.length > 0) {
      jobTasks.set(taskId, {...current, jobs: running, finished})
      return {
        resultType: 'complete',
        ...stamped,
        status: 'working',
        lastUpdatedAt: current.lastUpdatedAt,
        pollIntervalMs: TASK_POLL_MS,
      }
    }
    const result = {...current.reply, content: [...current.reply.content, ...finished.map(jobPart)]}
    const answer = {
      resultType: 'complete',
      ...stamped,
      status: 'completed',
      lastUpdatedAt: new Date().toISOString(),
      result,
    }
    jobTasks.set(taskId, {status: 'settled', createdAt: current.createdAt, answer})
    return answer
  }

  async function discoverCall(input: z.infer<typeof DiscoverInputSchema>, signal: AbortSignal): Promise<Reply> {
    const tab = TabInputSchema.parse(input.tab)
    const toolNames = input.toolNames
    const discovered = await routed(
      tab,
      (rpc, aborted) => rpc.code.discover({...buildSessionInput(tab), toolNames}, {signal: aborted}),
      codeDiscoverReply,
      signal,
    )
    if (tab === undefined) return discovered.reply
    const entry = ensureEntry(tab)
    const owner = await entry.owner?.catch(() => null)
    if (owner === undefined || owner === null) return discovered.reply
    return withFinished(discovered.reply, await reportedJobs(owner.rpc, entry, entry.jobs, signal))
  }

  function serveTools(server: McpServer): void {
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
    server.registerTool(
      LIST_TABS_TOOL_NAME,
      {description: LIST_TABS_DESCRIPTION, inputSchema: ListTabsInputSchema},
      async () => listTabsCall(home),
    )
    server.server.setRequestHandler('tasks/get', {params: TaskIdParamsSchema}, jobTask)
  }

  const descriptions = await currentRunner().then(
    (runner) => toolDescriptions(runner.described),
    () => FALLBACK_DESCRIPTIONS,
  )
  const server = createMCPServer({
    name: 'conciv-hub',
    version: cliManifest.version,
    sessions: 'memory',
    setup: serveTools,
  })
  const served = serveMCPStdio({...server, fetch: async (request) => server.fetch(await withTaskName(request))})
  await once(process.stdin, 'end')
  await served.close()
  return {report: 'none', code: 0}
}

async function pickRunner(home: string, headers: Record<string, string>): Promise<Runner> {
  const first = await runningEngines(home)
  const picked = await firstUsable(first.live, headers, [])
  if (picked.runner !== null) return picked.runner
  const second = await homeRead(home, askAgain(home, first.unreachable))
  const later = await firstUsable(
    differenceBy(second.live, first.live, (row) => row.id),
    headers,
    picked.unusable,
  )
  if (later.runner !== null) return later.runner
  throw noRunner(later.unusable, second.unreachable)
}

function noRunner(unusable: string[], silent: Silent): Error {
  if (unusable.length === 0) return cliErrors.NO_RUNNER({silent: silence(silent)})
  const named = silent.length === 0 ? unusable : [...unusable, silence(silent)]
  return cliErrors.NO_USABLE_RUNNER({named: named.join('; ')})
}

async function firstUsable(rows: EngineRow[], headers: Record<string, string>, unusable: string[]): Promise<Picked> {
  const [row, ...rest] = rows
  if (row === undefined) return {runner: null, unusable}
  const candidate = await runnerAt(row, headers)
  if (candidate.runner !== null) return {runner: candidate.runner, unusable}
  return firstUsable(rest, headers, [...unusable, `${row.root} (${candidate.unusable})`])
}

async function runnerAt(row: EngineRow, headers: Record<string, string>): Promise<Candidate> {
  const rpc = makeRpcClient(row.apiBase, {token: row.token, headers})
  return rpc.code.describe(undefined, {signal: AbortSignal.timeout(ENGINE_READ_MS)}).then(
    (described): Candidate => ({runner: {root: row.root, rpc, described}, unusable: null}),
    (error: unknown): Candidate => {
      if (engineTooOld(error)) return {runner: null, unusable: TOO_OLD}
      if (error instanceof ORPCError && error.code === contractCode(engineErrors.NO_CODE_MODE))
        return {runner: null, unusable: errorText(error)}
      logHub(`reading the tool descriptions of the conciv engine at ${row.root} failed; using the built-in text`, error)
      return {runner: {root: row.root, rpc, described: null}, unusable: null}
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
  const first = await liveEngines(home)
  const probes = await askTabs(first.live, tab, PROBE_MS)
  const [settled, unsettled] = partition(probes, (probe) => probe.answer !== null)
  if (openAnswers(probes).length > 0 || (first.unreachable.length === 0 && unsettled.length === 0)) {
    return ownerAmong(tab, probes, first.unreachable, headers)
  }
  const [second, retried] = await Promise.all([
    homeRead(home, askAgain(home, first.unreachable)),
    askTabs(
      unsettled.map((probe) => probe.row),
      tab,
      ENGINE_READ_MS,
    ),
  ])
  const later = await askTabs(
    differenceBy(second.live, first.live, (row) => row.id),
    tab,
    ENGINE_READ_MS,
  )
  return ownerAmong(tab, [...settled, ...retried, ...later], second.unreachable, headers)
}

function openAnswers(probes: TabAsk[]): Array<{row: EngineRow; answer: TabOpen}> {
  return probes.flatMap((probe) =>
    probe.answer !== null && probe.answer.open ? [{row: probe.row, answer: probe.answer}] : [],
  )
}

function ownerAmong(tab: SessionId, probes: TabAsk[], silent: Silent, headers: Record<string, string>): TabOwner {
  const [only, second] = openAnswers(probes)
  const failures = [
    ...probes.flatMap((probe) => (probe.answer === null ? [failedProbe(probe.row.root, probe.failure)] : [])),
    ...silent.map((entry) => cliErrors.PROBE_FAILED({text: silence([entry])})),
  ]
  if (only === undefined) throw notOpen(tab, failures)
  if (second !== undefined) {
    throw cliErrors.TAB_ON_TWO_ENGINES({tab, first: only.row.root, second: second.row.root})
  }
  return {
    root: only.row.root,
    apiBase: only.row.apiBase,
    token: only.row.token,
    instructions: only.answer.instructions,
    rpc: makeRpcClient(only.row.apiBase, {token: only.row.token, headers}),
  }
}

function notOpen(tab: SessionId, failures: unknown[]): Error {
  if (failures.length === 0) return cliErrors.HUB_TAB_NOT_OPEN({tab})
  return cliErrors.TAB_PROBES_FAILED({
    tab,
    failures: failures.map(errorText).join('; '),
    cause: new AggregateError(failures, 'the tab probes failed'),
  })
}

async function listTabsCall(home: string): Promise<Reply> {
  return listTabs(home).then(
    (listing): Reply => ({content: [{type: 'text', text: JSON.stringify(listing)}]}),
    (error: unknown) => failed(errorText(error)),
  )
}

function failedProbe(root: string, failure: unknown): Error {
  const cause = failure instanceof Error ? {cause: failure} : {}
  if (engineTooOld(failure)) return cliErrors.PROBE_FAILED({text: `${root} (${TOO_OLD})`, ...cause})
  return cliErrors.PROBE_FAILED({text: silence([{root, error: errorText(failure)}]), ...cause})
}

async function holdsTab(owner: TabOwner, tab: SessionId): Promise<boolean> {
  const asked = await askTab(owner, tab, PROBE_MS)
  if (asked.answer !== null) return asked.answer.open
  logHub(
    `checking whether tab ${tab} is still open failed; the next call looks up its engine again`,
    failedProbe(owner.root, asked.failure),
  )
  return false
}

function greeted(entry: TabEntry, owner: TabOwner, reply: Reply): Reply {
  if (entry.greeted) return reply
  entry.greeted = true
  if (owner.instructions === null) return reply
  return {...reply, content: [{type: 'text', text: owner.instructions}, ...reply.content]}
}

function buildSessionInput(tab: SessionId | undefined): {sessionId?: SessionId} {
  return tab === undefined ? {} : {sessionId: tab}
}

function jobPart(job: Waited): {type: 'text'; text: string} {
  return {type: 'text', text: cappedText(job.output ?? job.error ?? job.status)}
}

function withFinished(reply: Reply, finished: readonly Waited[]): Reply {
  if (finished.length === 0) return reply
  return {...reply, content: [...finished.map(jobPart), ...reply.content]}
}

function unrun(error: unknown): boolean {
  return (
    RefusedSchema.safeParse(error).success ||
    (error instanceof ORPCError && error.code === contractCode(engineErrors.UNAUTHORIZED))
  )
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
  const message: unknown = JSON.parse(body)
  const taskId = TaskRequestSchema.safeParse(message).data?.params.taskId
  const headers = new Headers(request.headers)
  if (taskId !== undefined) headers.set('mcp-name', taskId)
  return new Request(request.url, {method: request.method, headers, body, signal: request.signal})
}

function failed(text: string): Reply {
  return {content: [{type: 'text', text}], isError: true}
}

function logHub(message: string, error: unknown): void {
  log.error({action: 'conciv mcp', message, error: errorText(error)})
}
