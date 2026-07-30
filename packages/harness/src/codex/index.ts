import {codexText, CODEX_MODELS} from '@tanstack/ai-codex'
import {defineHarness, type HarnessChatConfig, type HarnessChatDeps} from '@conciv/protocol/harness-types'
import {definedEntries} from '../_shared/env.js'
import {codexMcpArgs} from './args.js'
import {codexHistory} from './history.js'

const codexChatConfig = (deps: HarnessChatDeps): HarnessChatConfig => ({
  adapter: codexText(deps.model ?? 'gpt-5.5', {
    sandboxMode: 'workspace-write',
    approvalPolicy: 'never',
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
    transcriptHistory: true,
    compaction: false,
    systemPrompt: 'flag',
    mcp: 'http',
    slashCommands: 'none',
    imageInput: false,
  },
  chatConfig: codexChatConfig,
  models: ['gpt-5.5', ...CODEX_MODELS].map((id) => ({id, name: id, group: 'Codex'})),
  defaultModel: 'gpt-5.5',
  history: codexHistory,
  connect: {
    plan: (ctx) => ({
      argv: [
        'codex',
        ...(ctx.resume && ctx.harnessSessionId ? ['resume', ctx.harnessSessionId] : []),
        ...(ctx.model ? ['-m', ctx.model] : []),
        ...(ctx.mcpUrl ? codexMcpArgs(ctx.mcpUrl, ctx.concivSessionId) : []),
      ],
      env: {},
      files: [],
    }),
  },
})
