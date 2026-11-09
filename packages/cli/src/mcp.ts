import {z} from 'zod'
import {argument, command, description, name, route, schema} from '@bomb.sh/router'
import {concivHome} from '@conciv/db'
import {createHubConnections} from '@conciv/harness-init/hub'
import {envelopeFlag, type CliOutcome} from './envelope.js'
import {userFailure} from './failure.js'
import {HubAgentSchema} from './hub-agent.js'
import {serveCommand} from './hub.js'
import {handler} from './router/handler.js'
import {serveArgv} from './serve-argv.js'

const AgentModelSchema = z.object({agent: HubAgentSchema})

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
    return settled(await connections().connect(agent, serveArgv(agent)), {connected: agent})
  }),
)

const disconnectCommand = command(
  name('disconnect'),
  description('Stop conciv answering an agent and remove conciv from that agent CLI.'),
  agentArgument,
  envelopeFlag,
  handler(async (model) => {
    const {agent} = AgentModelSchema.parse(model)
    return settled(await connections().disconnect(agent), {disconnected: agent})
  }),
)

const listCommand = command(
  name('list'),
  description('The agents connected to conciv.'),
  envelopeFlag,
  handler(() => ({report: 'json', data: connections().list()})),
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

function connections() {
  return createHubConnections(concivHome({env: process.env}))
}

function settled(
  outcome: {ok: true; note?: string} | {ok: false; message: string},
  data: Record<string, string>,
): CliOutcome {
  if (!outcome.ok) throw userFailure(outcome.message)
  return {report: 'json', data: outcome.note === undefined ? data : {...data, note: outcome.note}}
}
