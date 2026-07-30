import {defineHarness, type HarnessConnectContext, type HarnessConnectPlan} from '@conciv/protocol/harness-types'
import {concivHooksPluginDir} from '@conciv/protocol/state-types'
import {CONCIV_PLUGIN_DIR} from './plugin-dir.js'
import {claudeConnectArgs} from './args.js'
import {claudeAttach} from './attach.js'
import {claudeHooksPluginFiles} from './hooks-plugin.js'
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

function claudeConnectPlan(ctx: HarnessConnectContext): HarnessConnectPlan {
  const pluginArgs = CONCIV_PLUGIN_DIR ? ['--plugin-dir', CONCIV_PLUGIN_DIR] : []
  const hooks = ctx.hookUrl
    ? {
        dir: concivHooksPluginDir(ctx.stateDir, ctx.concivSessionId),
        files: claudeHooksPluginFiles({
          stateDir: ctx.stateDir,
          concivSessionId: ctx.concivSessionId,
          hookUrl: ctx.hookUrl,
        }),
      }
    : null
  const hookArgs = hooks ? ['--plugin-dir', hooks.dir] : []
  return {
    argv: ['claude', ...claudeConnectArgs(ctx), ...pluginArgs, ...hookArgs],
    env: {},
    files: hooks?.files ?? [],
  }
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
  connect: {plan: claudeConnectPlan},
  attach: claudeAttach,
  tty: {command: claudeTtyCommand},
})
