import {claudeInit} from '@conciv/harness-init/claude'
import {type HarnessConnectContext, type HarnessConnectPlan} from '@conciv/protocol/harness-types'
import {defineHarness} from '../_shared/contract.js'
import {CONCIV_PLUGIN_DIR} from './plugin-dir.js'
import {claudeConnectArgs} from './args.js'
import {claudeChatConfig} from './chat.js'
import {claudeHistory} from './history.js'
import {claudeSdkCommands, claudeSdkModels} from './sdk.js'
import {claudeTtyCommand} from './tty.js'

export {CHAT_SYSTEM_PROMPT} from './system-prompt.js'

function claudeConnectPlan(ctx: HarnessConnectContext): HarnessConnectPlan {
  const pluginArgs = CONCIV_PLUGIN_DIR ? ['--plugin-dir', CONCIV_PLUGIN_DIR] : []
  return {
    argv: ['claude', ...claudeConnectArgs(ctx), ...pluginArgs],
    env: {},
    files: [],
  }
}

export const claude = defineHarness({
  id: 'claude',
  binName: 'claude',
  displayName: 'Claude',
  models: claudeSdkModels,
  defaultModel: 'opus',
  capabilities: {
    resume: true,
    permissionGate: 'callback',
    transcriptHistory: true,
    compaction: true,
    systemPrompt: 'file',
    mcp: 'http',
    slashCommands: 'live',
    imageInput: 'fileRef',
    init: 'files',
  },
  init: claudeInit,
  chatConfig: claudeChatConfig,
  commands: claudeSdkCommands,
  history: claudeHistory,
  connect: {plan: claudeConnectPlan},
  tty: {command: claudeTtyCommand},
})
