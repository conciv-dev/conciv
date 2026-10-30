import {opencode as opencodeAdapter, opencodeModels} from '@conciv/ai/server'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {defineHarness, type HarnessChatConfig, type HarnessChatDeps} from '@conciv/protocol/harness-types'
import {opencodeHistory} from './history.js'

function opencodeMcpEnv(mcpUrl: string, concivSessionId: string): Record<string, string> {
  return {
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      mcp: {
        conciv: {
          type: 'remote',
          url: mcpUrl,
          headers: {[CONCIV_SESSION_HEADER]: concivSessionId},
          oauth: false,
          enabled: true,
        },
      },
    }),
  }
}

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
  models: opencodeModels.map((id) => ({id, name: id, group: 'OpenCode'})),
  defaultModel: 'opencode/claude-sonnet-4-5',
  history: opencodeHistory,
  connect: {
    plan: (ctx) => ({
      argv: ['opencode', ...(ctx.resume && ctx.harnessSessionId ? ['--session', ctx.harnessSessionId] : [])],
      env: ctx.mcpUrl ? opencodeMcpEnv(ctx.mcpUrl, ctx.concivSessionId) : {},
      files: [],
    }),
  },
})
