import {join} from 'node:path'
import type {HarnessConnectFile} from '@conciv/protocol/harness-types'

export const CLAUDE_CONNECT_ENDPOINT_FILE = 'mcp-endpoint.json'

export function claudeConnectEndpointPath(stateDir: string): string {
  return join(stateDir, CLAUDE_CONNECT_ENDPOINT_FILE)
}

export function claudeConnectEndpointFile(opts: {stateDir: string; mcpUrl: string}): HarnessConnectFile {
  return {
    path: claudeConnectEndpointPath(opts.stateDir),
    contents: `${JSON.stringify({mcpUrl: opts.mcpUrl}, null, 2)}\n`,
  }
}
