import {once} from 'node:events'
import {z} from 'zod'
import {differenceBy, partition} from 'es-toolkit'
import {ORPCError} from '@orpc/client'
import {createMCPServer, type McpServer} from '@tanstack/ai-mcp/server'
import {serveMCPStdio} from '@tanstack/ai-mcp/server/stdio'
import {concivHome, type EngineRow} from '@conciv/db'
import {
  codeDiscoverReply,
  codeExecuteReply,
  engineTooOld,
  makeRpcClient,
  type CodeDescriptions,
  type CodeDiscoverResult,
  type CodeExecuteResult,
  type CodeReply,
  type RpcClient,
} from '@conciv/contract'
import {
  CODE_MODE_EXTERNAL_PREFIX,
  CONCIV_CLIENT_HEADER,
  CONCIV_ORIGIN_HEADER,
  SessionId,
  type TabOpen,
} from '@conciv/protocol/chat-types'
import type {InitHarnessId} from '@conciv/protocol/harness-types'
import {PAGE_NAMESPACE} from '@conciv/plugin-page/rpc'
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
} from './engine-read.js'

const EXECUTE_TOOL_NAME = 'execute_typescript'

const DISCOVER_TOOL_NAME = 'discover_tools'

const LIST_TABS_TOOL_NAME = 'list_tabs'

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

type Runner = {root: string; rpc: RpcClient; described: CodeDescriptions | null}

type TabOwner = {root: string; apiBase: string; token: string; instructions: string | null; rpc: RpcClient}

type TabEntry = {owner: Promise<TabOwner> | null; greeted: boolean}

type EngineCall<Value> = (rpc: RpcClient, signal: AbortSignal | undefined) => Promise<Value>

type Routed<Value> = {reply: Reply; value: Value | null}

type Candidate = {runner: Runner; unusable: null} | {runner: null; unusable: string}

type Picked = {runner: Runner | null; unusable: string[]}

export async function runHub(env: NodeJS.ProcessEnv, agent: InitHarnessId): Promise<CliOutcome> {
  const home = concivHome({env})
  const held: {runner: Promise<Runner> | null} = {runner: null}
  const tabs = new Map<SessionId, TabEntry>()
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
      throw new Error(
        `the call failed on the conciv engine at ${runner.root} (${errorText(error)}); it was not retried, since the block may already have acted on a page; ${after}`,
        {cause: error},
      )
    }
  }

  function ensureEntry(tab: SessionId): TabEntry {
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

  async function executeCall(input: z.infer<typeof ExecuteInputSchema>, signal: AbortSignal): Promise<Reply> {
    const tab = TabInputSchema.parse(input.tab)
    const typescriptCode = input.typescriptCode
    const executed = await routed(
      tab,
      (rpc, aborted) => rpc.code.execute({...buildSessionInput(tab), typescriptCode}, {signal: aborted}),
      tab === undefined ? outsideExecuteReply : codeExecuteReply,
      signal,
    )
    return executed.reply
  }

  async function discoverCall(input: z.infer<typeof DiscoverInputSchema>, signal: AbortSignal): Promise<Reply> {
    const tab = TabInputSchema.parse(input.tab)
    const toolNames = input.toolNames
    const discovered = await routed(
      tab,
      (rpc, aborted) => rpc.code.discover({...buildSessionInput(tab), toolNames}, {signal: aborted}),
      (value) => codeDiscoverReply(notePageTools(value, toolNames)),
      signal,
    )
    return discovered.reply
  }

  function serveTools(server: McpServer): void {
    server.registerTool(
      EXECUTE_TOOL_NAME,
      {description: descriptions[EXECUTE_TOOL_NAME], inputSchema: ExecuteInputSchema},
      async (input, ctx) => executeCall(input, ctx.mcpReq.signal),
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
  const served = serveMCPStdio(server)
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
  if (unusable.length === 0) return new Error(`no conciv dev server answered: ${silence(silent)}`)
  const named = silent.length === 0 ? unusable : [...unusable, silence(silent)]
  return new Error(`no conciv dev server this hub can use is running: ${named.join('; ')}`)
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
      if (error instanceof ORPCError && error.code === 'NO_CODE_MODE') return {runner: null, unusable: errorText(error)}
      logHub(`reading the tool descriptions of the conciv engine at ${row.root} failed; using the built-in text`, error)
      return {runner: {root: row.root, rpc, described: null}, unusable: null}
    },
  )
}

function toolDescriptions(described: CodeDescriptions | null): Record<ToolName, string> {
  if (described === null) return FALLBACK_DESCRIPTIONS
  return {
    [EXECUTE_TOOL_NAME]: `${described.execute}\n\n${PAGE_TOOLS_NOTE}`,
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
    ...silent.map((entry) => new Error(silence([entry]))),
  ]
  if (only === undefined) throw notOpen(tab, failures)
  if (second !== undefined) {
    throw new Error(
      `tab ${tab} is open on two conciv engines (${only.row.root} and ${second.row.root}); ask the user to close one of the browser tabs`,
    )
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
  if (failures.length === 0) return new Error(`TAB_NOT_OPEN: tab ${tab} is not open; call list_tabs`)
  return new Error(
    `cannot tell whether tab ${tab} is open: no engine that answered has it, and ${failures.map(errorText).join('; ')}; nothing ran`,
    {cause: new AggregateError(failures, 'the tab probes failed')},
  )
}

async function listTabsCall(home: string): Promise<Reply> {
  return listTabs(home).then(
    (listing): Reply => ({content: [{type: 'text', text: JSON.stringify(listing)}]}),
    (error: unknown) => failed(errorText(error)),
  )
}

function failedProbe(root: string, failure: unknown): Error {
  if (engineTooOld(failure)) return new Error(`${root} (${TOO_OLD})`, {cause: failure})
  return new Error(silence([{root, error: errorText(failure)}]), {cause: failure})
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

function unrun(error: unknown): boolean {
  return RefusedSchema.safeParse(error).success || (error instanceof ORPCError && error.code === 'UNAUTHORIZED')
}

function answered(error: unknown): boolean {
  return error instanceof ORPCError || engineTooOld(error)
}

function answerText(root: string, error: unknown): string {
  return engineTooOld(error) ? `${root} (${TOO_OLD})` : errorText(error)
}

const NO_SESSION_HINT = 'pass tab to execute_typescript; list_tabs lists the open tabs'

function outsideExecuteReply(executed: CodeExecuteResult): Reply {
  const reply = codeExecuteReply(executed)
  if (executed.ok || executed.error.code !== 'NO_SESSION') return reply
  return {...reply, content: [...reply.content, {type: 'text', text: NO_SESSION_HINT}]}
}

function failed(text: string): Reply {
  return {content: [{type: 'text', text}], isError: true}
}

function logHub(message: string, error: unknown): void {
  process.stderr.write(`conciv mcp: ${message}: ${errorText(error)}\n`)
}

function notePageTools(discovered: CodeDiscoverResult, toolNames: string[]): CodeDiscoverResult {
  const refused = DiscoverErrorsSchema.safeParse(discovered.tools)
  const askedPage = toolNames.some((toolName) =>
    [PAGE_TOOL_PREFIX, `${CODE_MODE_EXTERNAL_PREFIX}${PAGE_TOOL_PREFIX}`].some((prefix) => toolName.startsWith(prefix)),
  )
  if (!refused.success || !askedPage) return discovered
  return {...discovered, tools: {...refused.data, errors: [...refused.data.errors, PAGE_TOOLS_NOTE]}}
}
