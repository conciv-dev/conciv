import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {HarnessConnectContext} from '@conciv/protocol/harness-types'

type McpHttpServer = {type: 'http'; url: string; headers?: Record<string, string>}

export function mcpServerConfig(mcpUrl: string, sessionId?: string): {conciv: McpHttpServer} {
  const conciv: McpHttpServer = {type: 'http', url: mcpUrl}
  return {conciv: sessionId ? {...conciv, headers: {[CONCIV_SESSION_HEADER]: sessionId}} : conciv}
}

export function claudeMcpArgs(mcpUrl: string, sessionId?: string): string[] {
  return ['--mcp-config', JSON.stringify({mcpServers: mcpServerConfig(mcpUrl, sessionId)}), '--strict-mcp-config']
}

export function claudeConnectArgs(ctx: HarnessConnectContext): string[] {
  const session = ctx.harnessSessionId ? [ctx.resume ? '--resume' : '--session-id', ctx.harnessSessionId] : []
  const model = ctx.model ? ['--model', ctx.model] : []
  const mcp = ctx.mcpUrl ? claudeMcpArgs(ctx.mcpUrl, ctx.concivSessionId) : []
  return [...session, ...model, ...mcp]
}
