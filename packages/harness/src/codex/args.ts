import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'

function tomlString(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

export function codexMcpArgs(mcpUrl: string, concivSessionId: string): string[] {
  const headers = `{${tomlString(CONCIV_SESSION_HEADER)}=${tomlString(concivSessionId)}}`
  return ['-c', `mcp_servers={conciv={url=${tomlString(mcpUrl)},http_headers=${headers},startup_timeout_sec=30}}`]
}
