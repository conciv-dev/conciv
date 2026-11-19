import type {Page} from 'playwright'
import {abortRpcCalls, failRpcCalls, type RpcFaultInjector} from './rpc-fault.js'

export type ChatTurnFault = RpcFaultInjector

const SEND_PATH = ['chat', 'send']

export function failChatTurns(page: Page, options: {status?: number} = {}): Promise<ChatTurnFault> {
  return failRpcCalls(page, {path: SEND_PATH, ...options})
}

export function dropChatTurns(page: Page): Promise<ChatTurnFault> {
  return abortRpcCalls(page, {path: SEND_PATH})
}
