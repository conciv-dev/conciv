import {codexText, CODEX_MODELS} from '@tanstack/ai-codex'
import {defineHarness, type HarnessChatConfig, type HarnessChatDeps} from '@conciv/protocol/harness-types'
import {definedEntries} from '../_shared/env.js'

const BRIDGED_MCP_SERVER_NAME = 'tanstack'

const codexChatConfig = (deps: HarnessChatDeps): HarnessChatConfig => ({
  adapter: codexText(deps.model ?? 'gpt-5.5', {
    sandboxMode: 'workspace-write',
    approvalPolicy: 'never',
    config: {[`mcp_servers.${BRIDGED_MCP_SERVER_NAME}.default_tools_approval_mode`]: '"approve"'},
    env: definedEntries(deps.env),
  }),
  modelOptions: deps.resumeSessionId ? {sessionId: deps.resumeSessionId} : {},
})

export const codex = defineHarness({
  id: 'codex',
  binName: 'codex',
  displayName: 'Codex',
  capabilities: {
    resume: true,
    permissionGate: 'none',
    transcriptHistory: false,
    compaction: false,
    systemPrompt: 'flag',
    mcp: 'none',
    slashCommands: 'none',
    imageInput: false,
  },
  chatConfig: codexChatConfig,
  models: ['gpt-5.5', ...CODEX_MODELS].map((id) => ({id, name: id, group: 'Codex'})),
  defaultModel: 'gpt-5.5',
  launch: (ctx) => {
    const argv = ['codex']
    if (ctx.sessionId) argv.push('resume', ctx.sessionId)
    if (ctx.model) argv.push('-m', ctx.model)
    return ctx.openTerminal(argv)
  },
})
