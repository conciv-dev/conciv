import {useBlocker} from '@tanstack/solid-router'
import {useMutation, useQuery} from '@tanstack/solid-query'
import type {MarkerRow, RpcClient} from '@conciv/contract'
import type {QueryUtils} from '@conciv/client'
import {notify} from '../shell/notices.js'

const COMPACT_FAILED = 'Compaction failed. The session may be busy. Try again in a moment.'
const STARTED_SESSION = 'Started a new session'

export type SessionMaintenanceDeps = {
  rpc: RpcClient
  utils: QueryUtils
  sessionId: () => string
  navigate: (sessionId: string) => void
  invalidateSessions: () => void
  announce: (message: string) => void
}

export type SessionMaintenance = {
  compacting: () => boolean
  compact: () => void
  newSession: () => Promise<void>
  refreshMarkers: () => void
  dividersAt: (count: number) => MarkerRow[]
  dividersInRange: (start: number, end: number) => MarkerRow[]
}

export function useTurnNavigationBlock(working: () => boolean): void {
  useBlocker({
    shouldBlockFn: ({current, next}) =>
      working() && next.pathname.startsWith('/panel') && next.pathname !== current.pathname,
  })
}

export function useSessionMaintenance(deps: SessionMaintenanceDeps): SessionMaintenance {
  const markers = useQuery(() => deps.utils.markers.list.queryOptions({input: {sessionId: deps.sessionId()}}))
  const refreshMarkers = (): void => void markers.refetch()

  const compact = useMutation(() => ({
    mutationFn: () => deps.rpc.sessions.compact({sessionId: deps.sessionId()}),
    onError: () => notify(COMPACT_FAILED),
    onSettled: () => {
      deps.invalidateSessions()
      refreshMarkers()
    },
  }))

  const rows = (): MarkerRow[] => markers.data ?? []

  return {
    compacting: () => compact.isPending,
    compact: () => compact.mutate(),
    newSession: async () => {
      const {sessionId} = await deps.rpc.sessions.create(undefined)
      deps.invalidateSessions()
      deps.navigate(sessionId)
      deps.announce(STARTED_SESSION)
    },
    refreshMarkers,
    dividersAt: (count) => rows().filter((row) => row.afterTurn === count),
    dividersInRange: (start, end) => rows().filter((row) => row.afterTurn >= start && row.afterTurn <= end),
  }
}
