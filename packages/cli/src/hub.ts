import {once} from 'node:events'
import {z} from 'zod'
import {command, description, name, option, schema} from '@bomb.sh/router'
import {createMCPClient, type MCPClient} from '@tanstack/ai-mcp'
import {createMCPServer} from '@tanstack/ai-mcp/server'
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

const ContentReplySchema = z.looseObject({content: z.array(z.unknown())})

const FALLBACK_DESCRIPTIONS = {
  [EXECUTE_TOOL_NAME]:
    'Run TypeScript in the sandbox of a running conciv dev server. Every capability is an async external_* function. external_tabs({}) lists the open conciv tabs (live pages running the conciv widget); pick the one the user means and pass its id as tab on every execute_typescript and discover_tools call. Return a value to pass results back.',
  [DISCOVER_TOOL_NAME]:
    'Typed signatures for the named external_* capabilities of execute_typescript; pass the same tab as on execute_typescript.',
}

type ToolName = keyof typeof FALLBACK_DESCRIPTIONS

type Runner = {root: string; client: MCPClient}

type Reply = {content: {type: 'text'; text: string}[]; isError: true}

type TabOwner = {root: string; apiBase: string; instructions: string | null; client: MCPClient}

type TabEntry = {owner: Promise<TabOwner> | null; greeted: boolean}

async function runHub(env: NodeJS.ProcessEnv, agent: InitHarnessId): Promise<CliOutcome> {
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

  async function dropRunner(picked: Promise<Runner>, runner: Runner): Promise<void> {
    if (held.runner !== picked) return
    held.runner = null
    await closeClient(runner)
  }

  async function forward(toolName: ToolName, input: unknown, resent = false): Promise<unknown> {
    const picked = currentRunner()
    const runner = await picked
    try {
      return await runner.client.callTool(toolName, input)
    } catch (error) {
      await dropRunner(picked, runner)
      if (!resent && RefusedSchema.safeParse(error).success) return forward(toolName, input, true)
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

  async function onTab(toolName: ToolName, input: unknown, tab: SessionId, resent = false): Promise<unknown> {
    const entry = entryOf(tab)
    const kept = (entry.owner ??= findOwner(home, tab, {...headers, [CONCIV_SESSION_HEADER]: tab}))
    const owner = await kept.catch((error: unknown) => {
      if (entry.owner === kept) entry.owner = null
      throw error
    })
    try {
      const reply = await owner.client.callTool(toolName, input)
      if (ErrorReplySchema.safeParse(reply).success && !(await holdsTab(owner.apiBase, tab))) {
        await forget(entry, kept, owner)
      }
      return greeted(entry, owner, reply)
    } catch (error) {
      await forget(entry, kept, owner)
      if (!resent && RefusedSchema.safeParse(error).success) return onTab(toolName, input, tab, true)
      throw new Error(
        `the call on tab ${tab} failed on the conciv engine at ${owner.root} (${errorText(error)}); it was not retried, since the block may already have acted on a page; the next call looks up the engine holding the tab again`,
        {cause: error},
      )
    }
  }

  function routed(toolName: ToolName) {
    return async ({tab: given, ...input}: {tab?: string | undefined}): Promise<unknown> => {
      const tab = TabInputSchema.parse(given)
      const call = tab === undefined ? forward(toolName, input) : onTab(toolName, input, tab)
      return call.catch((error: unknown) => failed(errorText(error)))
    }
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
    tools: [
      defineTool({
        name: EXECUTE_TOOL_NAME,
        description: descriptions[EXECUTE_TOOL_NAME],
        inputSchema: ExecuteInputSchema,
      }).server(routed(EXECUTE_TOOL_NAME)),
      defineTool({
        name: DISCOVER_TOOL_NAME,
        description: descriptions[DISCOVER_TOOL_NAME],
        inputSchema: DiscoverInputSchema,
      }).server(routed(DISCOVER_TOOL_NAME)),
    ],
  })
  const served = serveMCPStdio(server)
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
  const answers = await Promise.all(checked.live.map(async (row) => ({row, answer: await tabAnswer(row.apiBase, tab)})))
  const [only, second] = answers.filter(({answer}) => answer?.open === true)
  if (only === undefined) throw new Error(`TAB_NOT_OPEN: tab ${tab} is not open; call external_tabs({})`)
  if (second !== undefined) {
    throw new Error(
      `tab ${tab} is open on two conciv engines (${only.row.root} and ${second.row.root}); ask the user to close one of the browser tabs`,
    )
  }
  const client = await connect(only.row, headers)
  return {root: only.row.root, apiBase: only.row.apiBase, instructions: only.answer?.instructions ?? null, client}
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

async function tabAnswer(apiBase: string, tab: SessionId): Promise<TabOpen | null> {
  try {
    const response = await fetch(`${apiBase}/api/tabs?session=${tab}`, {signal: AbortSignal.timeout(PROBE_MS)})
    if (!response.ok) return null
    return TabOpenSchema.safeParse(await response.json()).data ?? null
  } catch (error) {
    if (isUnanswered(error)) return null
    throw error
  }
}

function isUnanswered(error: unknown): boolean {
  if (error instanceof TypeError || error instanceof SyntaxError) return true
  return error instanceof DOMException && error.name === 'TimeoutError'
}

async function holdsTab(apiBase: string, tab: SessionId): Promise<boolean> {
  return (await tabAnswer(apiBase, tab))?.open === true
}

function greeted(entry: TabEntry, owner: TabOwner, reply: unknown): unknown {
  if (entry.greeted) return reply
  entry.greeted = true
  const parsed = ContentReplySchema.safeParse(reply)
  if (owner.instructions === null || !parsed.success) return reply
  return {...parsed.data, content: [{type: 'text', text: owner.instructions}, ...parsed.data.content]}
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
