import {useChat} from '@tanstack/ai-solid'
import type {RpcClient} from '@conciv/contract'
import {chatConnection} from './chat-connection.js'

export type UseChatSessionOptions = {
  rpc: RpcClient
  sessionId: string
  onCustomEvent?: (eventType: string, data: unknown, context: {toolCallId?: string}) => void
  onError?: (error: Error) => void
}

export function useChatSession(options: UseChatSessionOptions): ReturnType<typeof useChat> {
  return useChat({
    id: options.sessionId,
    connection: chatConnection(options.rpc, options.sessionId),
    live: true,
    onCustomEvent: options.onCustomEvent,
    onError: options.onError,
  })
}
