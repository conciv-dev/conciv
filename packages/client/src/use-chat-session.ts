import {useChat} from '@tanstack/ai-solid'
import type {RpcClient} from '@conciv/contract'
import {chatConnection, type ChatConnectionOptions} from './chat-connection.js'

export type UseChatSessionOptions = {
  rpc: RpcClient
  sessionId: string
  connection?: ChatConnectionOptions
  onError?: (error: Error) => void
}

export type ChatSession = ReturnType<typeof useChat> & {refresh: () => void}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

export function useChatSession(options: UseChatSessionOptions): ChatSession {
  const connection = chatConnection(options.rpc, options.sessionId, options.connection ?? {})
  const chat = useChat({
    id: options.sessionId,
    threadId: options.sessionId,
    connection,
    live: true,
    queue: 'interrupt',
    onError: options.onError,
  })
  const stop = () => {
    chat.stop()
    void options.rpc.chat.stop({sessionId: options.sessionId}).catch((error) => options.onError?.(asError(error)))
  }
  return {...chat, stop, refresh: connection.refresh}
}
