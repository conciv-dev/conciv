import {createHubConnections} from '@conciv/harness-init/hub'
import {initContributions} from '@conciv/harness-init/registry'
import {CONCIV_BIN} from '@conciv/harness-init/agent-guide'
import type {InitHarnessId} from '@conciv/protocol/harness-types'
import {serveArgv} from '../../../serve-argv.js'
import type {StepOutcome} from '../../ledger.js'
import type {InitContext, InitStep, SpawnBin} from '../../pipeline.js'

type ConnectAgentIo = {concivHome: string; spawn: SpawnBin}

export function connectAgentStep(agent: InitHarnessId, consented: () => InitHarnessId[], io: ConnectAgentIo): InitStep {
  const name = initContributions[agent].hub?.name ?? agent
  const card = {
    title: `Connect ${name} to conciv`,
    body: `Run this once ${name} is installed, so it can find your open conciv tabs:`,
    snippet: `${CONCIV_BIN} mcp connect ${agent}`,
  }
  return {
    id: `connect-${agent}`,
    title: `Connect ${name} to conciv`,
    running: `Connecting ${name} to conciv…`,
    completed: `Connected ${name} to conciv`,
    detect: async () => (connected(io, agent) ? 'present' : 'missing'),
    plan: async () => ({summary: `add conciv-hub to the ${name} MCP config`, wouldEdit: [`${name} MCP config`]}),
    apply: (ctx) => applyConnect(ctx, agent, consented, io, card),
    verify: async () => connected(io, agent),
    manualCard: () => card,
  }
}

async function applyConnect(
  ctx: InitContext,
  agent: InitHarnessId,
  consented: () => InitHarnessId[],
  io: ConnectAgentIo,
  card: {title: string; body: string; snippet: string},
): Promise<StepOutcome> {
  if (!consented().includes(agent)) return {status: 'skipped', detail: 'not selected'}
  const outcome = await connections(io, ctx).connect(agent, serveArgv(agent))
  if (outcome.ok) return {status: 'done'}
  return {status: 'manual', cards: [card], detail: outcome.message}
}

function connections(io: ConnectAgentIo, ctx: InitContext) {
  return createHubConnections(io.concivHome, async (argv) => {
    const [bin, ...args] = argv
    if (bin === undefined) return {ok: false, output: '', message: 'the harness gave no command to run'}
    const outcome = await io.spawn(bin, args, ctx.cwd, ctx.feed)
    return {ok: outcome.code === 0, output: outcome.output, message: outcome.output.trim()}
  })
}

function connected(io: ConnectAgentIo, agent: InitHarnessId): boolean {
  try {
    return createHubConnections(io.concivHome)
      .list()
      .some((connection) => connection.harness === agent)
  } catch {
    return false
  }
}
