import {opencodeText, OPENCODE_MODELS, type OpencodePermissionRequest} from '@tanstack/ai-opencode'
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

export function opencodePermissionHandler(decide: HarnessChatDeps['decide']) {
  return async (request: OpencodePermissionRequest): Promise<'once' | 'reject'> => {
    const decision = await decide(request.type, {title: request.title}, request.callID ?? request.id)
    return decision === 'allow' ? 'once' : 'reject'
  }
}

const opencodeChatConfig = (deps: HarnessChatDeps): HarnessChatConfig => ({
  adapter: opencodeText(deps.model ?? 'opencode/claude-sonnet-4-5', {
    onPermissionRequest: opencodePermissionHandler(deps.decide),
  }),
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
  },
  chatConfig: opencodeChatConfig,
  models: OPENCODE_MODELS.map((id) => ({id, name: id, group: 'OpenCode'})),
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
