export * from './settings/settings.js'
export type {SelectedEvent, SubscribeOptions} from './plugin/shared-events.js'
export type {PluginInfo} from './plugin/plugin-info.js'
export type {ClientConnectionOptions, ClientConnectionStatus, ConcivClient, ConcivEvent} from './plugin/conciv.js'
export type {
  PluginClient,
  RpcApi,
  RpcArguments,
  RpcCallOptions,
  RpcEventPayload,
  RpcMethod,
  RpcQueryArguments,
  RpcQueryKey,
} from './plugin/rpc.js'
export type {RpcApi as EffectRpcApi, RpcClient as EffectRpcClient} from './plugin/effect-rpc.js'
export type {ServerRef, Servers} from './plugin/servers.js'
export {Conciv} from './plugin/conciv.js'
export {makeRpc, rpcMethod} from './plugin/rpc.js'
export * from './connection/browser-transport.js'
export * from './connection/rpc-client.js'
export * from './chat/chat-connection.js'
export * from './connection/reachability.js'
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
import {safe} from '@orpc/client'
import {createChatSession, type ChatSession} from './chat.js'
import type {EngineClient} from './connection/rpc-client.js'
import {chatConnection, type ChatConnectionOptions} from './chat/chat-connection.js'
export type {ChatSession} from './chat.js'
import {createTanstackQueryUtils, type RouterUtils} from '@orpc/tanstack-query'

export function makeQueryUtils(client: EngineClient): RouterUtils<EngineClient> {
  return createTanstackQueryUtils(client)
}

export type QueryUtils = ReturnType<typeof makeQueryUtils>

export type UseChatSessionOptions = {
  rpc: EngineClient
  sessionId: string
  connection?: ChatConnectionOptions
  onError?: (error: Error) => void
}

export function useChatSession(options: UseChatSessionOptions): ChatSession {
  return createChatSession({
    sessionId: options.sessionId,
    onError: options.onError,
    connect: (session) =>
      chatConnection(options.rpc, options.sessionId, {
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
        onLiveAgain: () => {
          options.connection?.onLiveAgain?.()
          session.onLiveAgain()
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
