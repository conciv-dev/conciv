import {makeQueryUtils, type QueryUtils, type QueryClient, type QueryKey} from '@conciv/client'
import type {RpcClient} from '@conciv/contract'

export type AppData = {
  utils: QueryUtils
  invalidateSessions: () => Promise<void>
  invalidateSession: (sessionId: string) => Promise<void>
  invalidateOutsideAccess: () => Promise<void>
}

export function makeAppData(rpc: RpcClient, queryClient: QueryClient): AppData {
  const utils = makeQueryUtils(rpc)
  const listKeys = [utils.sessions.list.key(), utils.sessions.search.key()]
  for (const queryKey of [...listKeys, utils.sessions.get.key()]) {
    queryClient.setQueryDefaults(queryKey, {refetchOnWindowFocus: false})
  }
  const invalidate = async (queryKeys: QueryKey[]) => {
    await Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({queryKey})))
  }
  return {
    utils,
    invalidateSessions: () => invalidate([...listKeys, utils.sessions.get.key()]),
    invalidateSession: (sessionId) => invalidate([...listKeys, utils.sessions.get.key({input: {sessionId}})]),
    invalidateOutsideAccess: () => queryClient.invalidateQueries({queryKey: utils.chat.outsideAccess.key()}),
  }
}
