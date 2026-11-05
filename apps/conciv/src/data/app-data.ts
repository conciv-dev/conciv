import {makeQueryUtils, type QueryUtils} from '@conciv/client'
import type {QueryClient} from '@tanstack/solid-query'
import type {RpcClient} from '@conciv/contract'

export type AppData = {
  utils: QueryUtils
  invalidateSessions: () => Promise<void>
}

export function makeAppData(rpc: RpcClient, queryClient: QueryClient): AppData {
  const utils = makeQueryUtils(rpc)
  return {
    utils,
    invalidateSessions: () => queryClient.invalidateQueries({queryKey: utils.sessions.list.key()}),
  }
}
