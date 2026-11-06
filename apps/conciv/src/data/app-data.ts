import {makeQueryUtils, type QueryUtils} from '@conciv/client'
import type {QueryClient} from '@tanstack/solid-query'
import type {RpcClient} from '@conciv/contract'

const SESSIONS_STALE_MS = 30_000

export type AppData = {
  utils: QueryUtils
  invalidateSessions: () => Promise<void>
}

export function makeAppData(rpc: RpcClient, queryClient: QueryClient): AppData {
  const utils = makeQueryUtils(rpc)
  const sessionKeys = [utils.sessions.list.key(), utils.sessions.get.key()]
  for (const queryKey of sessionKeys) {
    queryClient.setQueryDefaults(queryKey, {staleTime: SESSIONS_STALE_MS, refetchOnWindowFocus: false})
  }
  return {
    utils,
    invalidateSessions: async () => {
      await Promise.all(sessionKeys.map((queryKey) => queryClient.invalidateQueries({queryKey})))
    },
  }
}
