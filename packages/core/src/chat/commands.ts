import type {ChatCommand, ChatCommands} from '@conciv/protocol/chat-types'
import {apiBaseFrom} from '../lib/api-base.js'
import type {ChatDeps} from './runtime.js'

export function mcpUrlFor(deps: ChatDeps, requestUrl: string): string {
  return `${apiBaseFrom(requestUrl, deps.basePath)}/api/mcp`
}

function commandSource(name: string): ChatCommand['source'] {
  if (name.startsWith('mcp__')) return 'mcp'
  if (name.includes(':')) return 'plugin'
  return 'harness'
}

export async function listCommands(
  deps: ChatDeps,
  opts: {sessionId?: string; requestUrl: string},
): Promise<ChatCommands> {
  const commands = deps.harness.commands
  if (!commands) return {commands: []}
  const mcpUrl = deps.harness.capabilities.mcp === 'http' ? mcpUrlFor(deps, opts.requestUrl) : undefined
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
