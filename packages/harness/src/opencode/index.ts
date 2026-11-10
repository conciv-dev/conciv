import {opencode as opencodeAdapter} from '@conciv/ai/server'
import {type HarnessChatDeps} from '@conciv/protocol/harness-types'
import {defineHarness, type HarnessChatConfig} from '../_shared/contract.js'
import {opencodeHistory} from './history.js'
import {opencodeModels} from './models.js'

const opencodeChatConfig = (deps: HarnessChatDeps): HarnessChatConfig => ({
  adapter: opencodeAdapter(deps.model ?? 'opencode/claude-sonnet-4-5', {}),
  modelOptions: deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {},
})

export const opencode = defineHarness({
  id: 'opencode',
  binName: 'opencode',
  displayName: 'OpenCode',
  capabilities: {
    resume: true,
    permissionGate: 'callback',
    transcriptHistory: true,
    compaction: false,
    systemPrompt: 'flag',
    mcp: 'http',
    slashCommands: 'none',
    imageInput: false,
    init: 'none',
  },
  chatConfig: opencodeChatConfig,
  models: opencodeModels,
  defaultModel: 'opencode/claude-sonnet-4-5',
  history: opencodeHistory,
  resume: {command: ({nativeId}) => ({bin: 'opencode', args: ['--session', nativeId]})},
})
