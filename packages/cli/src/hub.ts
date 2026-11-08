import {once} from 'node:events'
import {z} from 'zod'
import {command, description, name} from '@bomb.sh/router'
import {createMCPClient, type MCPClient} from '@tanstack/ai-mcp'
import {createMCPServer, type McpServer} from '@tanstack/ai-mcp/server'
import {serveMCPStdio} from '@tanstack/ai-mcp/server/stdio'
import {checkEngines, concivHome, type EngineRow} from '@conciv/db'
import {defineTool} from '@conciv/protocol/chat-tool-types'
import {CONCIV_CLIENT_HEADER, CONCIV_ORIGIN_HEADER} from '@conciv/protocol/chat-types'
import cliManifest from '../package.json' with {type: 'json'}
import type {CliOutcome} from './envelope.js'
import {handler} from './router/handler.js'

const EXECUTE_TOOL_NAME = 'execute_typescript'

const DISCOVER_TOOL_NAME = 'discover_tools'

const PROBE_MS = 2000

const CLIENT_NAME_MAX = 64

const ExecuteInputSchema = z.object({
  typescriptCode: z
    .string()
    .describe(
      'TypeScript to run in the sandbox. Call capabilities as async sandbox functions, discover them with the `discover_tools` tool, and return a value to pass results back.',
    ),
})

const DiscoverInputSchema = z.object({toolNames: z.array(z.string())})

const FALLBACK_DESCRIPTIONS = {
  [EXECUTE_TOOL_NAME]:
    'Run TypeScript in the sandbox of a running conciv dev server. Every capability is an async external_* function. external_tabs({}) lists the open conciv tabs (live pages running the conciv widget); external_use_tab({id}) picks one for the rest of the block and returns its instructions and tool signatures. Return a value to pass results back.',
  [DISCOVER_TOOL_NAME]: 'Typed signatures for the named external_* capabilities of execute_typescript.',
}

type ToolName = keyof typeof FALLBACK_DESCRIPTIONS

type Runner = {apiBase: string; root: string; client: MCPClient}

type Reply = {content: {type: 'text'; text: string}[]; isError: true}

async function runHub(env: NodeJS.ProcessEnv): Promise<CliOutcome> {
  const home = concivHome({env})
  const held: {runner: Runner | null; server: McpServer | null} = {runner: null, server: null}

  function clientHeaders(): Record<string, string> {
    const client = held.server?.server.getClientVersion()?.name.slice(0, CLIENT_NAME_MAX)
    return {[CONCIV_ORIGIN_HEADER]: 'hub', ...(client ? {[CONCIV_CLIENT_HEADER]: client} : {})}
  }

  async function runnerClient(row: EngineRow): Promise<MCPClient> {
    if (held.runner?.apiBase === row.apiBase) return held.runner.client
    await dropRunner()
    const client = await createMCPClient({
      transport: {type: 'http', url: `${row.apiBase}/api/mcp`, headers: clientHeaders()},
      name: 'conciv-hub',
    })
    held.runner = {apiBase: row.apiBase, root: row.root, client}
    return client
  }

  async function dropRunner(): Promise<void> {
    const runner = held.runner
    held.runner = null
    await runner?.client
      .close()
      .catch((error: unknown) => logHub(`closing the client of the conciv engine at ${runner.root} failed`, error))
  }

  async function forward(toolName: ToolName, input: unknown): Promise<unknown> {
    const row = (await checkEngines(home, {timeoutMs: PROBE_MS})).live.at(-1)
    if (row === undefined) {
      return failed(`no conciv dev server is running; start one and open its page (conciv home folder read: ${home})`)
    }
    try {
      return await (await runnerClient(row)).callTool(toolName, input)
    } catch (error) {
      await dropRunner()
      return failed(`the conciv engine at ${row.root} stopped answering (${errorText(error)})`)
    }
  }

  const descriptions = await startupDescriptions(home)
  const server = createMCPServer({
    name: 'conciv-hub',
    version: cliManifest.version,
    tools: [
      defineTool({
        name: EXECUTE_TOOL_NAME,
        description: descriptions[EXECUTE_TOOL_NAME],
        inputSchema: ExecuteInputSchema,
      }).server((input) => forward(EXECUTE_TOOL_NAME, input)),
      defineTool({
        name: DISCOVER_TOOL_NAME,
        description: descriptions[DISCOVER_TOOL_NAME],
        inputSchema: DiscoverInputSchema,
      }).server((input) => forward(DISCOVER_TOOL_NAME, input)),
    ],
    setup: (mcp) => {
      held.server = mcp
    },
  })
  const served = serveMCPStdio(server)
  await once(process.stdin, 'end')
  await served.close()
  await dropRunner()
  return {report: 'none', code: 0}
}

export const mcpCommand = command(
  name('mcp'),
  description('Serve conciv to an outside agent over MCP stdio, through the running conciv dev server.'),
  handler(() => runHub(process.env)),
)

async function startupDescriptions(home: string): Promise<Record<ToolName, string>> {
  try {
    const row = (await checkEngines(home, {timeoutMs: PROBE_MS})).live.at(-1)
    if (row === undefined) return FALLBACK_DESCRIPTIONS
    const client = await createMCPClient({
      transport: {type: 'http', url: `${row.apiBase}/api/mcp`, headers: {[CONCIV_ORIGIN_HEADER]: 'hub'}},
      name: 'conciv-hub',
    })
    try {
      const tools = await client.tools()
      const described = (tool: ToolName) =>
        tools.find((entry) => entry.name === tool)?.description ?? FALLBACK_DESCRIPTIONS[tool]
      return {[EXECUTE_TOOL_NAME]: described(EXECUTE_TOOL_NAME), [DISCOVER_TOOL_NAME]: described(DISCOVER_TOOL_NAME)}
    } finally {
      await client.close().catch((error: unknown) => logHub('closing the startup client failed', error))
    }
  } catch (error) {
    logHub('reading the runner tool descriptions failed; using the built-in text', error)
    return FALLBACK_DESCRIPTIONS
  }
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
