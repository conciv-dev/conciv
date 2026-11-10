import {once} from 'node:events'
import {z} from 'zod'
import {command, description, name, option, schema} from '@bomb.sh/router'
import {createMCPClient, type MCPClient} from '@tanstack/ai-mcp'
import {createMCPServer} from '@tanstack/ai-mcp/server'
import {serveMCPStdio} from '@tanstack/ai-mcp/server/stdio'
import {checkEngines, concivHome} from '@conciv/db'
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

type Lookup = Promise<TabOwner | Reply>

type TabEntry = {owner: Lookup | null; greeted: boolean}

async function runHub(env: NodeJS.ProcessEnv, agent: InitHarnessId): Promise<CliOutcome> {
  const home = concivHome({env})
  const held: {runner: Promise<Runner | null> | null} = {runner: null}
  const tabs = new Map<SessionId, TabEntry>()
  const headers = {[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: agent}

  function currentRunner(): Promise<Runner | null> {
    held.runner ??= pickRunner(home, headers).catch(noRunner)
    return held.runner
  }

  async function dropRunner(runner: Runner | null): Promise<void> {
    if (runner === null || (await held.runner) !== runner) return
    held.runner = null
    await closeClient(runner)
  }

  async function forward(toolName: ToolName, input: unknown, resent = false): Promise<unknown> {
    const runner = await currentRunner()
    if (runner === null) {
      held.runner = null
      return failed(`no conciv dev server is running; start one and open its page (conciv home folder read: ${home})`)
    }
    try {
      return await runner.client.callTool(toolName, input)
    } catch (error) {
      await dropRunner(runner)
      if (!resent && RefusedSchema.safeParse(error).success) return forward(toolName, input, true)
      const next = await currentRunner()
      const after = next === null ? 'no other conciv dev server is running' : `the next call runs on ${next.root}`
      return failed(
        `the call failed on the conciv engine at ${runner.root} (${errorText(error)}); it was not retried, since the block may already have acted on a page; ${after}`,
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

  async function forget(entry: TabEntry, kept: Lookup): Promise<void> {
    if (entry.owner !== kept) return
    entry.owner = null
    const owner = await kept
    if ('client' in owner) await closeClient(owner)
  }

  async function onTab(toolName: ToolName, input: unknown, tab: SessionId, resent = false): Promise<unknown> {
    const entry = entryOf(tab)
    const kept = (entry.owner ??= findOwner(home, tab, {...headers, [CONCIV_SESSION_HEADER]: tab}))
    const owner = await kept
    if (!('client' in owner)) {
      await forget(entry, kept)
      return owner
    }
    try {
      const reply = await owner.client.callTool(toolName, input)
      if (ErrorReplySchema.safeParse(reply).success && !(await holdsTab(owner.apiBase, tab))) {
        await forget(entry, kept)
      }
      return greeted(entry, owner, reply)
    } catch (error) {
      await forget(entry, kept)
      if (!resent && RefusedSchema.safeParse(error).success) return onTab(toolName, input, tab, true)
      return failed(
        `the call on tab ${tab} failed on the conciv engine at ${owner.root} (${errorText(error)}); it was not retried, since the block may already have acted on a page; the next call looks up the engine holding the tab again`,
      )
    }
  }

  function routed(toolName: ToolName) {
    return async ({tab: given, ...input}: {tab?: string | undefined}): Promise<unknown> => {
      const tab = TabInputSchema.parse(given)
      return tab === undefined ? forward(toolName, input) : onTab(toolName, input, tab)
    }
  }

  const startup = await currentRunner()
  const descriptions = await startupDescriptions(startup).catch(async (error: unknown) => {
    logHub('reading the runner tool descriptions failed; using the built-in text', error)
    await dropRunner(startup)
    return FALLBACK_DESCRIPTIONS
  })
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
  await dropRunner(await held.runner)
  await Promise.all([...tabs.values()].map((entry) => (entry.owner === null ? null : forget(entry, entry.owner))))
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

async function pickRunner(home: string, headers: Record<string, string>): Promise<Runner | null> {
  const row = (await checkEngines(home, {timeoutMs: PROBE_MS})).live[0]
  if (row === undefined) return null
  const client = await createMCPClient({
    transport: {type: 'http', url: `${row.apiBase}/api/mcp`, headers},
    name: 'conciv-hub',
  })
  return {root: row.root, client}
}

async function startupDescriptions(runner: Runner | null): Promise<Record<ToolName, string>> {
  if (runner === null) return FALLBACK_DESCRIPTIONS
  const tools = await runner.client.tools()
  const described = (tool: ToolName) =>
    tools.find((entry) => entry.name === tool)?.description ?? FALLBACK_DESCRIPTIONS[tool]
  return {[EXECUTE_TOOL_NAME]: described(EXECUTE_TOOL_NAME), [DISCOVER_TOOL_NAME]: described(DISCOVER_TOOL_NAME)}
}

async function findOwner(home: string, tab: SessionId, headers: Record<string, string>): Lookup {
  const checked = await checkEngines(home, {timeoutMs: PROBE_MS}).catch((error: unknown) =>
    failed(`cannot read the conciv home folder ${home}: ${errorText(error)}`),
  )
  if ('isError' in checked) return checked
  const answers = await Promise.all(checked.live.map(async (row) => ({row, answer: await tabAnswer(row.apiBase, tab)})))
  const [only, second] = answers.filter(({answer}) => answer?.open === true)
  if (only === undefined) return failed(`TAB_NOT_OPEN: tab ${tab} is not open; call external_tabs({})`)
  if (second !== undefined) {
    return failed(
      `tab ${tab} is open on two conciv engines (${only.row.root} and ${second.row.root}); ask the user to close one of the browser tabs`,
    )
  }
  try {
    const client = await createMCPClient({
      transport: {type: 'http', url: `${only.row.apiBase}/api/mcp`, headers},
      name: 'conciv-hub',
    })
    return {root: only.row.root, apiBase: only.row.apiBase, instructions: only.answer?.instructions ?? null, client}
  } catch (error) {
    return failed(`connecting to the conciv engine at ${only.row.root} failed (${errorText(error)}); nothing ran`)
  }
}

async function tabAnswer(apiBase: string, tab: SessionId): Promise<TabOpen | null> {
  try {
    const response = await fetch(`${apiBase}/api/tabs?session=${tab}`, {signal: AbortSignal.timeout(PROBE_MS)})
    if (!response.ok) return null
    return TabOpenSchema.safeParse(await response.json()).data ?? null
  } catch {
    return null
  }
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

async function closeClient(owner: {root: string; client: MCPClient}): Promise<void> {
  await owner.client
    .close()
    .catch((error: unknown) => logHub(`closing the client of the conciv engine at ${owner.root} failed`, error))
}

function noRunner(error: unknown): null {
  logHub('picking a conciv engine failed', error)
  return null
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
