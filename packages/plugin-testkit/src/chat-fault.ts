import type {RpcSocketSource} from './rpc-socket.js'
import {abortRpcCalls, failRpcCalls, type RpcFaultInjector} from './rpc-fault.js'

export type ChatTurnFault = RpcFaultInjector

const SEND_PATH = ['chat', 'send']

export function failChatTurns(source: RpcSocketSource, options: {status?: number} = {}): Promise<ChatTurnFault> {
  return failRpcCalls(source, {path: SEND_PATH, ...options})
}

export function dropChatTurns(source: RpcSocketSource): Promise<ChatTurnFault> {
  return abortRpcCalls(source, {path: SEND_PATH})
}
