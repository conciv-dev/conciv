import type {ConfigProvider} from 'effect'
import {readOptionalConfig} from '../_shared/optional-config.js'
import {opencode as opencodeAdapter} from '../adapters/adapters.js'
import {type HarnessChatDeps} from '@conciv/types/harness-types'
import {defineHarness, type HarnessChatConfig} from '../_shared/contract.js'
import {opencodeHistory, storagePath} from './history.js'
import {opencodeModels} from './models.js'

const opencodeChatConfig = async (deps: HarnessChatDeps): Promise<HarnessChatConfig> => ({
  adapter: opencodeAdapter(deps.model ?? 'opencode/claude-sonnet-4-5', {}),
  modelOptions: deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {},
})

export function opencode(provider: ConfigProvider.ConfigProvider) {
  const dbPath = storagePath(readOptionalConfig(provider, 'XDG_DATA_HOME'))
  return defineHarness({
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
      login: 'none',
    },
    chatConfig: opencodeChatConfig,
    models: opencodeModels,
    defaultModel: async () => 'opencode/claude-sonnet-4-5',
    history: opencodeHistory(dbPath),
    resume: {command: ({nativeId}) => ({bin: 'opencode', args: ['--session', nativeId]})},
  })
}
