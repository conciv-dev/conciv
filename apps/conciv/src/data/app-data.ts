import {makeQueryUtils, type QueryUtils} from '@conciv/client'
import type {QueryClient} from '@tanstack/solid-query'
import type {RpcClient} from '@conciv/contract'

const SESSIONS_LIST_STALE_MS = 30_000

export type AppData = {
  utils: QueryUtils
  invalidateSessions: () => void
}

export function makeAppData(rpc: RpcClient, queryClient: QueryClient): AppData {
  const utils = makeQueryUtils(rpc)
  queryClient.setQueryDefaults(utils.sessions.list.key(), {
    staleTime: SESSIONS_LIST_STALE_MS,
    refetchOnWindowFocus: false,
  })
  return {
    utils,
    invalidateSessions: () =>
      void queryClient.invalidateQueries({queryKey: utils.sessions.list.key()}, {cancelRefetch: false}),
  }
}
