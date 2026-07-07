import {defineHarness, type HarnessLaunchContext} from '@conciv/protocol/harness-types'
import {CONCIV_PLUGIN_DIR} from './plugin-dir.js'
import {claudeMcpArgs} from './args.js'
import {claudeChatConfig} from './chat.js'
import {claudeHistory} from './history.js'
import {claudeSdkCommands} from './sdk.js'
import {claudeTtyCommand} from './tty.js'

export {CHAT_SYSTEM_PROMPT} from './system-prompt.js'

const CLAUDE_MODELS = [
  {id: 'opus', name: 'Claude Opus 4.8', description: 'Most capable', group: 'Claude', contextWindow: 200000},
  {
    id: 'sonnet',
    name: 'Claude Sonnet 4.6',
    description: 'Balanced speed + capability',
    group: 'Claude',
    contextWindow: 200000,
  },
  {id: 'haiku', name: 'Claude Haiku 4.5', description: 'Fastest', group: 'Claude', contextWindow: 200000},
  {id: 'claude-fable-5', name: 'Fable 5', description: 'Disabled', group: 'Claude', disabled: true},
]

const claudeLaunch = (ctx: HarnessLaunchContext) => {
  const argv = ['claude']
  if (ctx.sessionId) argv.push('--resume', ctx.sessionId)
  if (ctx.model) argv.push('--model', ctx.model)
  if (ctx.mcpUrl) argv.push(...claudeMcpArgs(ctx.mcpUrl))
  if (CONCIV_PLUGIN_DIR) argv.push('--plugin-dir', CONCIV_PLUGIN_DIR)
  return ctx.openTerminal(argv)
}

export const claude = defineHarness({
  id: 'claude',
  binName: 'claude',
  displayName: 'Claude',
  models: CLAUDE_MODELS,
  defaultModel: 'sonnet',
  capabilities: {
    resume: true,
    permissionGate: 'callback',
    transcriptHistory: true,
    compaction: true,
    systemPrompt: 'file',
    mcp: 'http',
    slashCommands: 'live',
    imageInput: 'fileRef',
  },
  chatConfig: claudeChatConfig,
  commands: claudeSdkCommands,
  history: claudeHistory,
  launch: claudeLaunch,
  tty: {command: claudeTtyCommand},
})
