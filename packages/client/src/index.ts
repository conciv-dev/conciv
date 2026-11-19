export * from './chat-connection.js'
export * from './reachability.js'
export {
  QueryClient,
  QueryClientProvider,
  isCancelledError,
  keepPreviousData,
  MutationObserver as QueryMutationObserver,
  useInfiniteQuery,
  useIsFetching,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type CreateMutationResult,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/solid-query'
export {createTanstackQueryUtils} from '@orpc/tanstack-query'
import {safe} from '@orpc/client'
import {createChatSession, type ChatSession} from '@conciv/ai/client'
import type {RpcClient} from '@conciv/contract'
import {chatConnection, type ChatConnectionOptions} from './chat-connection.js'
export type {ChatSession} from '@conciv/ai/client'
import {createTanstackQueryUtils, type RouterUtils} from '@orpc/tanstack-query'

export function makeQueryUtils(client: RpcClient): RouterUtils<RpcClient> {
  return createTanstackQueryUtils(client)
}

export type QueryUtils = ReturnType<typeof makeQueryUtils>

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
        onApprovalSettled: (approvalId) => {
          options.connection?.onApprovalSettled?.(approvalId)
          session.onApprovalSettled(approvalId)
        },
        joinsRun: session.joinsRun,
      }),
    stop: (runIds) => options.rpc.chat.stop({sessionId: options.sessionId, runIds}),
    decide: async (approvalId, reply) => {
      const answer = await safe(options.rpc.chat.permissionDecision({approvalId, reply}))
      if (answer.isSuccess) return
      if (answer.isDefined && answer.error.code === 'UNKNOWN_REQUEST') return
      throw answer.error
    },
  })
}
