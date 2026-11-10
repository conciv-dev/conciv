import {once} from 'node:events'
import {z} from 'zod'
import {command, description, name, option, schema} from '@bomb.sh/router'
import {createMCPClient, type MCPClient} from '@tanstack/ai-mcp'
import {createMCPServer} from '@tanstack/ai-mcp/server'
import {serveMCPStdio} from '@tanstack/ai-mcp/server/stdio'
import {checkEngines, concivHome} from '@conciv/db'
import {defineTool} from '@conciv/protocol/chat-tool-types'
import {CONCIV_CLIENT_HEADER, CONCIV_ORIGIN_HEADER} from '@conciv/protocol/chat-types'
import type {InitHarnessId} from '@conciv/protocol/harness-types'
import {HubAgentSchema} from './hub-agent.js'
import cliManifest from '../package.json' with {type: 'json'}
import type {CliOutcome} from './envelope.js'
import {handler} from './router/handler.js'

const EXECUTE_TOOL_NAME = 'execute_typescript'

const DISCOVER_TOOL_NAME = 'discover_tools'

const PROBE_MS = 300

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

type Runner = {root: string; client: MCPClient}

type Reply = {content: {type: 'text'; text: string}[]; isError: true}

async function runHub(env: NodeJS.ProcessEnv, agent: InitHarnessId): Promise<CliOutcome> {
  const home = concivHome({env})
  const held: {runner: Promise<Runner | null> | null} = {runner: null}
  const headers = {[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: agent}

  function currentRunner(): Promise<Runner | null> {
    held.runner ??= pickRunner(home, headers).catch(noRunner)
    return held.runner
  }

  async function dropRunner(runner: Runner | null): Promise<void> {
    if (runner === null || (await held.runner) !== runner) return
    held.runner = null
    await runner.client
      .close()
      .catch((error: unknown) => logHub(`closing the client of the conciv engine at ${runner.root} failed`, error))
  }

  async function forward(toolName: ToolName, input: unknown): Promise<unknown> {
    const runner = await currentRunner()
    if (runner === null) {
      held.runner = null
      return failed(`no conciv dev server is running; start one and open its page (conciv home folder read: ${home})`)
    }
    try {
      return await runner.client.callTool(toolName, input)
    } catch (error) {
      await dropRunner(runner)
      const next = await currentRunner()
      const after = next === null ? 'no other conciv dev server is running' : `the next call runs on ${next.root}`
      return failed(
        `the call failed on the conciv engine at ${runner.root} (${errorText(error)}); it was not retried, since the block may already have acted on a page; ${after}`,
      )
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
      }).server((input) => forward(EXECUTE_TOOL_NAME, input)),
      defineTool({
        name: DISCOVER_TOOL_NAME,
        description: descriptions[DISCOVER_TOOL_NAME],
        inputSchema: DiscoverInputSchema,
      }).server((input) => forward(DISCOVER_TOOL_NAME, input)),
    ],
  })
  const served = serveMCPStdio(server)
  await once(process.stdin, 'end')
  await served.close()
  await dropRunner(await held.runner)
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
