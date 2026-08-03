import {makeExtRpcClient} from '@conciv/extension'
import type {TerminalRouter} from '../server.js'
import {TERMINAL_NAME} from '../shared/protocol.js'

export function terminalClient(apiBase: string): ReturnType<typeof makeExtRpcClient<TerminalRouter>> {
  return makeExtRpcClient<TerminalRouter>(apiBase, TERMINAL_NAME)
}

export function terminalUrl(apiBase: string, path: string): string {
  return `${apiBase}/api/ext/${TERMINAL_NAME}/${path}`
}
