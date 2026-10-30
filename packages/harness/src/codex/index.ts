import {codex as codexAdapter} from '@conciv/ai/server'
import {type HarnessChatDeps} from '@conciv/protocol/harness-types'
import {defineHarness, type HarnessChatConfig} from '../_shared/contract.js'
import {definedEntries} from '../_shared/env.js'
import {codexMcpArgs} from './args.js'
import {codexHistory} from './history.js'
import {codexDefaultModel, codexHome, codexModels} from './models.js'

const BRIDGED_MCP_SERVER_NAME = 'tanstack'

const bridgeApproveConfig = {[`mcp_servers.${BRIDGED_MCP_SERVER_NAME}.default_tools_approval_mode`]: '"approve"'}

const codexChatConfig = (deps: HarnessChatDeps): HarnessChatConfig => ({
  adapter: codexAdapter(deps.model ?? codexDefaultModel(codexHome(deps.env)), {
    sandboxMode: 'workspace-write',
    approvalPolicy: 'never',
    ...(deps.hasTools ? {config: bridgeApproveConfig} : {}),
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
    init: 'none',
  },
  chatConfig: codexChatConfig,
  models: () => codexModels(),
  defaultModel: codexDefaultModel(),
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
