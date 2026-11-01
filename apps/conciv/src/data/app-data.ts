import {hubQueryUtils, makeQueryUtils, type HubCall, type QueryGroup, type QueryUtils} from '@conciv/client'
import type {QueryClient} from '@tanstack/solid-query'
import type {RpcClient} from '@conciv/contract'

export type AppData = {
  utils: QueryUtils
  invalidateSessions: () => void
}

const DEVFRAME_GROUPS = new Set<QueryGroup>()

export function makeAppData(rpc: RpcClient, hub: HubCall | undefined, queryClient: QueryClient): AppData {
  const orpcUtils = makeQueryUtils(rpc)
  const utils = hub ? hubQueryUtils(orpcUtils, hub, DEVFRAME_GROUPS) : orpcUtils
  return {
    utils,
    invalidateSessions: () => void queryClient.invalidateQueries({queryKey: utils.sessions.list.key()}),
  }
}
