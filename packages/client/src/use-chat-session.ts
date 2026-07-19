import {useChat, type UseChatOptions} from '@tanstack/ai-solid'
import type {RpcClient} from '@conciv/contract'
import {chatConnection, type ChatConnectionOptions} from './chat-connection.js'

export type UseChatSessionOptions = {
  rpc: RpcClient
  sessionId: string
  queue?: UseChatOptions['queue']
  connection?: ChatConnectionOptions
  onError?: (error: Error) => void
}

export function useChatSession(options: UseChatSessionOptions): ReturnType<typeof useChat> {
  return useChat({
    id: options.sessionId,
    connection: chatConnection(options.rpc, options.sessionId, options.connection ?? {}),
    live: true,
    queue: options.queue ?? {whenBusy: 'queue', drain: 'fifo'},
    onError: options.onError,
  })
}
