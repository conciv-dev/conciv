import {makeExtRpcClient} from '@conciv/extension'
import type {TerminalRouter} from '@conciv/extension-terminal/server'
import {resolveApiBase} from '../lib/api-base.js'

export type TerminalRpc = ReturnType<typeof makeExtRpcClient<TerminalRouter>>

export function terminalRpc(): TerminalRpc {
  return makeExtRpcClient<TerminalRouter>(resolveApiBase(), 'terminal')
}
