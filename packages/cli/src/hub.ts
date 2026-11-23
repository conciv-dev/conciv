import {once} from 'node:events'
import {z} from 'zod'
import {Effect, Exit, Scope} from 'effect'
import {createMCPServer, type McpServer} from '@tanstack/ai-mcp/server'
import {serveMCPStdio} from '@tanstack/ai-mcp/server/stdio'
import {concivHome} from '@conciv/db'
import {
  cappedText,
  codeDiscoverReply,
  codeExecuteReply,
  type CodeDescriptions,
  type CodeDiscoverResult,
  type CodeExecuteResult,
  type CodeReply,
} from '@conciv/contract'
import {
  CODE_MODE_EXTERNAL_PREFIX,
  CONCIV_CLIENT_HEADER,
  CONCIV_ORIGIN_HEADER,
  SessionId,
} from '@conciv/protocol/chat-types'
import type {InitHarnessId} from '@conciv/protocol/harness-types'
import cliManifest from '../package.json' with {type: 'json'}
import type {CliOutcome} from './envelope.js'
import {errorText, listTabs, logHub} from './engine-read.js'
import {failed, sendCall, type Route} from './hub/call.js'
import {makeEngines, type Engines, type Runner} from './hub/engines.js'
import {pageCall, PAGE_NAMESPACE, pollQueue, type OutsideQueues} from './hub/page.js'
import {makeTabs, type TabOwner, type Tabs} from './hub/tabs.js'
import {makeQueues, TASK_POLL_MS, type Queues, type TaskReply} from './hub/tasks.js'

const EXECUTE_TOOL_NAME = 'execute_typescript'

const DISCOVER_TOOL_NAME = 'discover_tools'

const LIST_TABS_TOOL_NAME = 'list_tabs'

const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks'

const CLIENT_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities'

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

const TasksCapableSchema = z.object({
  [CLIENT_CAPABILITIES]: z.object({extensions: z.object({[TASKS_EXTENSION]: z.unknown()})}),
})

const TaskIdParamsSchema = z.object({taskId: z.string().min(1)})

const TaskRequestSchema = z.object({params: TaskIdParamsSchema})

const PAGE_TOOL_PREFIX = `${PAGE_NAMESPACE}_`

const PAGE_TOOLS_NOTE = `Page tools (${CODE_MODE_EXTERNAL_PREFIX}${PAGE_TOOL_PREFIX}*) are offered only for a tab whose page is open and connected: if none are listed, that page is closed or still connecting, so ask the user to open the app in the browser and call again with that tab.`

const DiscoverErrorsSchema = z.looseObject({errors: z.array(z.string()).min(1)})

const FALLBACK_DESCRIPTIONS = {
  [EXECUTE_TOOL_NAME]: `Run TypeScript in the sandbox of a running conciv dev server. Every capability is an async external_* function. list_tabs lists the open conciv tabs (live pages running the conciv widget); pick the one the user means and pass its id as tab on every execute_typescript and discover_tools call. Return a value to pass results back. ${PAGE_TOOLS_NOTE}`,
  [DISCOVER_TOOL_NAME]:
    'Typed signatures for the named external_* capabilities of execute_typescript; pass the same tab as on execute_typescript.',
}

type ToolName = keyof typeof FALLBACK_DESCRIPTIONS

type Reply = CodeReply

type TextPart = {type: 'text'; text: string}

type Machines = {engines: Engines; tabs: Tabs; queues: Queues}

const NOTHING_QUEUED: OutsideQueues = {queued: [], finished: []}

export async function runHub(env: NodeJS.ProcessEnv, agent: InitHarnessId): Promise<CliOutcome> {
  const home = concivHome({env})
  const headers = {[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: agent}
  const scope = Effect.runSync(Scope.make())
  const machines = await Effect.runPromise(makeMachines(home, headers).pipe(Scope.provide(scope)))

  function serveTools(server: McpServer): void {
    server.registerTool(
      EXECUTE_TOOL_NAME,
      {description: descriptions[EXECUTE_TOOL_NAME], inputSchema: ExecuteInputSchema},
      async (input, ctx) =>
        Effect.runPromise(executeCall(machines, input, TasksCapableSchema.safeParse(ctx.mcpReq.envelope).success), {
          signal: ctx.mcpReq.signal,
        }),
    )
    server.registerTool(
      DISCOVER_TOOL_NAME,
      {description: descriptions[DISCOVER_TOOL_NAME], inputSchema: DiscoverInputSchema},
      async (input, ctx) => Effect.runPromise(discoverCall(machines, input), {signal: ctx.mcpReq.signal}),
    )
    server.registerTool(
      LIST_TABS_TOOL_NAME,
      {description: LIST_TABS_DESCRIPTION, inputSchema: ListTabsInputSchema},
      async () => listTabsCall(home),
    )
    server.server.setRequestHandler('tasks/get', {params: TaskIdParamsSchema}, async (params) =>
      Effect.runPromise(machines.queues.get(TaskIdParamsSchema.parse(params).taskId)),
    )
  }

  const descriptions = await Effect.runPromise(
    machines.engines.runner.pipe(
      Effect.map((runner) => toolDescriptions(runner.described)),
      Effect.orElseSucceed(() => FALLBACK_DESCRIPTIONS),
    ),
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
  await Effect.runPromise(Scope.close(scope, Exit.void))
  return {report: 'none', code: 0}
}

const makeMachines = Effect.fn('Hub.machines')(function* (home: string, headers: Record<string, string>) {
  const engines = yield* makeEngines(home, headers)
  const tabs = yield* makeTabs(home, headers)
  const queues = yield* makeQueues((tab, queueId) =>
    sendCall(tabRoute(tabs, tab), (owner, signal) =>
      pollQueue(owner.lookup, tab, queueId, AbortSignal.any([signal, AbortSignal.timeout(TASK_POLL_MS)])),
    ).pipe(
      Effect.map((sent) => sent.value),
      Effect.orElseSucceed(() => null),
    ),
  )
  const machines: Machines = {engines, tabs, queues}
  return machines
})

function runnerRoute(engines: Engines): Route<Runner> {
  return {
    path: 'runner',
    target: engines.runner,
    drop: engines.drop,
    failure: (runner, error) =>
      engines.runner.pipe(
        Effect.map((next) => `the next call runs on ${next.root}`),
        Effect.orElseSucceed(() => 'no other conciv dev server is running'),
        Effect.map(
          (after) =>
            new Error(
              `the call failed on the conciv engine at ${runner.root} (${errorText(error)}); it was not retried, since the block may already have acted on a page; ${after}`,
              {cause: error},
            ),
        ),
      ),
  }
}

function tabRoute(tabs: Tabs, tab: SessionId): Route<TabOwner> {
  return {
    path: 'tab',
    target: tabs.owner(tab),
    drop: (owner) => tabs.forget(tab, owner),
    holds: (owner) => tabs.holds(tab, owner),
    failure: (owner, error) =>
      Effect.succeed(
        new Error(
          `the call on tab ${tab} failed on the conciv engine at ${owner.root} (${errorText(error)}); it was not retried, since the block may already have acted on a page; the next call looks up the engine holding the tab again`,
          {cause: error},
        ),
      ),
  }
}

function executeCall(
  machines: Machines,
  input: z.infer<typeof ExecuteInputSchema>,
  tasksCapable: boolean,
): Effect.Effect<Reply | TaskReply> {
  const tab = TabInputSchema.parse(input.tab)
  const typescriptCode = input.typescriptCode
  if (tab === undefined) {
    return sendCall(runnerRoute(machines.engines), (runner, signal) =>
      runner.rpc.code.execute({typescriptCode}, {signal}),
    ).pipe(
      Effect.map((sent) => (sent.value === null ? sent.reply : outsideExecuteReply(sent.value))),
      Effect.catch((error) => Effect.succeed(failed(errorText(error)))),
    )
  }
  return Effect.gen(function* () {
    const sent = yield* sendCall(tabRoute(machines.tabs, tab), (owner, signal) =>
      owner.rpc.code.execute({sessionId: tab, typescriptCode}, {signal}),
    )
    if (sent.value === null) return yield* machines.tabs.greet(tab, sent.target, sent.reply)
    const toolCallIds = [...(yield* machines.queues.owedToolCalls(tab)), ...sent.value.toolCalls]
    const outside = yield* outsideQueues(sent.target, tab, toolCallIds)
    const own = yield* machines.queues.replied(tab, toolCallIds, outside)
    const executed = codeExecuteReply(sent.value)
    const notices = outside.finished.map((finished): TextPart => ({type: 'text', text: cappedText(finished.notice)}))
    const reply = yield* machines.tabs.greet(tab, sent.target, {
      ...executed,
      content: [...notices, ...executed.content],
    })
    if (own.length === 0 || !tasksCapable) return reply
    return yield* machines.queues.create(tab, own, reply)
  }).pipe(Effect.catch((error) => Effect.succeed(failed(errorText(error)))))
}

function outsideQueues(owner: TabOwner, tab: SessionId, toolCallIds: string[]): Effect.Effect<OutsideQueues> {
  if (toolCallIds.length === 0) return Effect.succeed(NOTHING_QUEUED)
  return Effect.tryPromise({
    try: (signal) => pageCall(owner.lookup, 'queue.outside', {sessionId: tab, toolCallIds}, signal),
    catch: (error) => error,
  }).pipe(
    Effect.map((outside) => outside ?? NOTHING_QUEUED),
    Effect.catch((error) => {
      logHub(`reading the queues of tab ${tab} failed; the reply goes without them`, error)
      return Effect.succeed(NOTHING_QUEUED)
    }),
  )
}

function discoverCall(machines: Machines, input: z.infer<typeof DiscoverInputSchema>): Effect.Effect<Reply> {
  const tab = TabInputSchema.parse(input.tab)
  const toolNames = input.toolNames
  const discovered = (value: CodeDiscoverResult) => codeDiscoverReply(notePageTools(value, toolNames))
  if (tab === undefined) {
    return sendCall(runnerRoute(machines.engines), (runner, signal) =>
      runner.rpc.code.discover({toolNames}, {signal}),
    ).pipe(
      Effect.map((sent) => (sent.value === null ? sent.reply : discovered(sent.value))),
      Effect.catch((error) => Effect.succeed(failed(errorText(error)))),
    )
  }
  return sendCall(tabRoute(machines.tabs, tab), (owner, signal) =>
    owner.rpc.code.discover({sessionId: tab, toolNames}, {signal}),
  ).pipe(
    Effect.flatMap((sent) =>
      machines.tabs.greet(tab, sent.target, sent.value === null ? sent.reply : discovered(sent.value)),
    ),
    Effect.catch((error) => Effect.succeed(failed(errorText(error)))),
  )
}

function toolDescriptions(described: CodeDescriptions | null): Record<ToolName, string> {
  if (described === null) return FALLBACK_DESCRIPTIONS
  return {
    [EXECUTE_TOOL_NAME]: `${described.execute}\n\n${PAGE_TOOLS_NOTE}`,
    [DISCOVER_TOOL_NAME]: described.discover ?? FALLBACK_DESCRIPTIONS[DISCOVER_TOOL_NAME],
  }
}

async function listTabsCall(home: string): Promise<Reply> {
  return listTabs(home).then(
    (listing): Reply => ({content: [{type: 'text', text: JSON.stringify(listing)}]}),
    (error: unknown) => failed(errorText(error)),
  )
}

const NO_SESSION_HINT = 'pass tab to execute_typescript; list_tabs lists the open tabs'

function outsideExecuteReply(executed: CodeExecuteResult): Reply {
  const reply = codeExecuteReply(executed)
  if (executed.ok || executed.error.code !== 'NO_SESSION') return reply
  return {...reply, content: [...reply.content, {type: 'text', text: NO_SESSION_HINT}]}
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

function notePageTools(discovered: CodeDiscoverResult, toolNames: string[]): CodeDiscoverResult {
  const refused = DiscoverErrorsSchema.safeParse(discovered.tools)
  const askedPage = toolNames.some((toolName) =>
    [PAGE_TOOL_PREFIX, `${CODE_MODE_EXTERNAL_PREFIX}${PAGE_TOOL_PREFIX}`].some((prefix) => toolName.startsWith(prefix)),
  )
  if (!refused.success || !askedPage) return discovered
  return {...discovered, tools: {...refused.data, errors: [...refused.data.errors, PAGE_TOOLS_NOTE]}}
}
