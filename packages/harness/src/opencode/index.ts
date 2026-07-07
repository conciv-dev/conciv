import {opencodeText, OPENCODE_MODELS, type OpencodePermissionRequest} from '@tanstack/ai-opencode'
import {defineHarness, type HarnessChatConfig, type HarnessChatDeps} from '@conciv/protocol/harness-types'

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
    transcriptHistory: false,
    compaction: false,
    systemPrompt: 'flag',
    mcp: 'none',
    slashCommands: 'none',
    imageInput: false,
  },
  chatConfig: opencodeChatConfig,
  models: OPENCODE_MODELS.map((id) => ({id, name: id, group: 'OpenCode'})),
  defaultModel: 'opencode/claude-sonnet-4-5',
})
