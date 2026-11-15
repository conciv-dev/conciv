import {codex as codexAdapter, type TextAdapter} from '@conciv/ai/server'
import {type HarnessChatDeps} from '@conciv/protocol/harness-types'
import {definedEntries} from '../_shared/env.js'
import {codexDefaultModel, codexHome} from './models.js'

const TANSTACK_MCP_SERVER_NAME = 'tanstack'

const approveTanstackToolsConfig = {
  [`mcp_servers.${TANSTACK_MCP_SERVER_NAME}.default_tools_approval_mode`]: '"approve"',
}

function effortConfig(effort: string | undefined): Record<string, string> {
  return effort === undefined ? {} : {model_reasoning_effort: `"${effort}"`}
}

export function codexRunAdapter(deps: HarnessChatDeps, toolCount: number): TextAdapter {
  return codexAdapter(deps.model ?? codexDefaultModel(codexHome(deps.env)), {
    sandboxMode: 'workspace-write',
    approvalPolicy: 'never',
    config: {...(toolCount > 0 ? approveTanstackToolsConfig : {}), ...effortConfig(deps.effort)},
    env: definedEntries(deps.env),
  })
}
