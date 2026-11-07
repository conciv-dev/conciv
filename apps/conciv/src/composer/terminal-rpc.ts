import {makeExtRpcClient} from '@conciv/extension'
import type {TerminalRouter} from '@conciv/extension-terminal/server'

export type TerminalRpc = ReturnType<typeof makeExtRpcClient<TerminalRouter>>

export function terminalRpc(apiBase: string): TerminalRpc {
  return makeExtRpcClient<TerminalRouter>(apiBase, 'terminal')
}
