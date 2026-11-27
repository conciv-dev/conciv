import {z} from 'zod'
import {argument, command, description, name, option, route, schema} from '@bomb.sh/router'
import {concivHome} from '@conciv/home'
import {envelopeFlag, type CliOutcome} from './envelope.js'
import {cliErrors} from './failure.js'
import {handler} from './router/handler.js'
import {serveArgv} from './serve-argv.js'
import {initContributions} from '@conciv/harness/init/registry'
import {INIT_HARNESS_IDS} from '@conciv/types/harness-types'

const HubAgentSchema = z
  .enum(INIT_HARNESS_IDS)
  .refine((id) => initContributions[id].hub !== undefined, {message: 'this agent has no conciv hub connection'})

const AgentModelSchema = z.object({agent: HubAgentSchema})

const serveCommand = command(
  name('serve'),
  description('Serve conciv to an outside agent over MCP stdio, through the running conciv dev server.'),
  option(
    name('agent'),
    description('the agent this server answers for (claude, codex, gemini-cli, opencode)'),
    schema(HubAgentSchema),
  ),
  handler(async (model) => {
    const {runHub} = await import('./hub.js')
    return runHub(process.env, AgentModelSchema.parse(model).agent)
  }),
)

const agentArgument = argument(
  name('agent'),
  description('claude, codex, gemini-cli or opencode'),
  schema(HubAgentSchema),
)

const connectCommand = command(
  name('connect'),
  description('Add conciv to an agent CLI, so that agent can find and drive your open conciv tabs.'),
  agentArgument,
  envelopeFlag,
  handler(async (model) => {
    const {agent} = AgentModelSchema.parse(model)
    return settled(await (await connections()).connect(agent, serveArgv(agent)), {connected: agent})
  }),
)

const disconnectCommand = command(
  name('disconnect'),
  description('Stop conciv answering an agent and remove conciv from that agent CLI.'),
  agentArgument,
  envelopeFlag,
  handler(async (model) => {
    const {agent} = AgentModelSchema.parse(model)
    return settled(await (await connections()).disconnect(agent), {disconnected: agent})
  }),
)

const listCommand = command(
  name('list'),
  description('The agents connected to conciv.'),
  envelopeFlag,
  handler(async () => ({report: 'json', data: await (await connections()).list()})),
)

export const mcpRoute = route(
  name('mcp'),
  description('Connect outside agents to conciv, and the MCP server they run.'),
  envelopeFlag,
  serveCommand,
  connectCommand,
  disconnectCommand,
  listCommand,
)

async function connections() {
  const {createHubConnections} = await import('@conciv/harness/init/hub')
  return createHubConnections(concivHome({env: process.env}))
}

function settled(
  outcome: {ok: true; note?: string} | {ok: false; message: string},
  data: Record<string, string>,
): CliOutcome {
  if (!outcome.ok) throw cliErrors.HUB_REFUSED({message: outcome.message})
  return {report: 'json', data: outcome.note === undefined ? data : {...data, note: outcome.note}}
}
