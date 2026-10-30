import {createChatSession, type ChatSession} from '@conciv/ai/client'
import type {RpcClient} from '@conciv/contract'
import {chatConnection, type ChatConnectionOptions} from './chat-connection.js'

export type {ChatSession} from '@conciv/ai/client'

export type UseChatSessionOptions = {
  rpc: RpcClient
  apiBase: string
  sessionId: string
  connection?: ChatConnectionOptions
  onError?: (error: Error) => void
}

export function useChatSession(options: UseChatSessionOptions): ChatSession {
  return createChatSession({
    sessionId: options.sessionId,
    onError: options.onError,
    connect: (session) =>
      chatConnection(options.rpc, options.apiBase, options.sessionId, {
        ...options.connection,
        onLifecycle: (lifecycle) => {
          options.connection?.onLifecycle?.(lifecycle)
          session.onLifecycle(lifecycle)
        },
        onHydrated: (hydration) => {
          options.connection?.onHydrated?.(hydration)
          session.onHydrated(hydration)
        },
        onRunError: () => {
          options.connection?.onRunError?.()
          session.onRunError()
        },
        onApprovalAsk: (ask) => {
          options.connection?.onApprovalAsk?.(ask)
          session.onApprovalAsk(ask)
        },
      }),
    stop: (runIds) => options.rpc.chat.stop({sessionId: options.sessionId, runIds}),
    decide: (approvalId, approved, scope) => options.rpc.chat.permissionDecision({approvalId, approved, scope}),
  })
}
