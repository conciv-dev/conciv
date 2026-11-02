import type {ChatCommand, ChatCommands, SessionId} from '@conciv/protocol/chat-types'
import type {HarnessAdapter} from '@conciv/harness'

export type CommandSource = {harness: HarnessAdapter; cwd: string; agentPath: string}

export function mcpUrlFor(deps: CommandSource, origin: string): string {
  return `${origin}${deps.agentPath}/api/mcp`
}

function commandSource(name: string): ChatCommand['source'] {
  if (name.startsWith('mcp__')) return 'mcp'
  if (name.includes(':')) return 'plugin'
  return 'harness'
}

export async function listCommands(
  deps: CommandSource,
  opts: {sessionId: SessionId; origin: string},
): Promise<ChatCommands> {
  const commands = deps.harness.commands
  if (!commands) return {commands: []}
  const mcpUrl = deps.harness.capabilities.mcp === 'http' ? mcpUrlFor(deps, opts.origin) : undefined
  const list = await commands({cwd: deps.cwd, sessionId: opts.sessionId, mcpUrl})
  return {
    commands: list.map((command) => ({
      name: command.name,
      description: command.description ?? '',
      ...(command.argumentHint ? {argumentHint: command.argumentHint} : {}),
      source: commandSource(command.name),
    })),
  }
}
