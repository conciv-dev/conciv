import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'

type McpHttpServer = {type: 'http'; url: string; headers?: Record<string, string>}

export function mcpServerConfig(mcpUrl: string, sessionId?: string): {conciv: McpHttpServer} {
  const conciv: McpHttpServer = {type: 'http', url: mcpUrl}
  return {conciv: sessionId ? {...conciv, headers: {[CONCIV_SESSION_HEADER]: sessionId}} : conciv}
}

export function claudeMcpArgs(mcpUrl: string, sessionId?: string): string[] {
  return ['--mcp-config', JSON.stringify({mcpServers: mcpServerConfig(mcpUrl, sessionId)}), '--strict-mcp-config']
}
