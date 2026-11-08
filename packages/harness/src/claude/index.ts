import {claudeInit} from '@conciv/harness-init/claude'
import {defineHarness} from '../_shared/contract.js'
import {claudeChatConfig} from './chat.js'
import {claudeHistory} from './history.js'
import {claudeSdkCommands, claudeSdkModels} from './sdk.js'
import {claudeTtyCommand} from './tty.js'

export {CHAT_SYSTEM_PROMPT} from './system-prompt.js'

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
  tty: {command: claudeTtyCommand},
})
