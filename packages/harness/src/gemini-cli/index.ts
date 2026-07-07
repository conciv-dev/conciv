import {defineHarness} from '@conciv/protocol/harness-types'
import {acpChatConfig} from '../_shared/acp.js'

const GEMINI_MODELS = ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash']

export const geminiCli = defineHarness({
  id: 'gemini-cli',
  binName: 'gemini',
  displayName: 'Gemini CLI',
  capabilities: {
    resume: true,
    permissionGate: 'callback',
    transcriptHistory: false,
    compaction: false,
    systemPrompt: 'flag',
    mcp: 'none',
    slashCommands: 'none',
    imageInput: false,
  },
  chatConfig: acpChatConfig('gemini-cli', (model) => `gemini --acp -m ${model}`, 'gemini-3-pro-preview'),
  models: GEMINI_MODELS.map((id) => ({id, name: id, group: 'Gemini'})),
  defaultModel: 'gemini-3-pro-preview',
})
