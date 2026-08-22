import {useQuery, type QueryClient} from '@tanstack/solid-query'
import {createMemo} from 'solid-js'
import type {SessionMeta} from '@conciv/contract'
import type {AppData} from '../data/app-data.js'

export type WarmSession = {
  rows: () => SessionMeta[]
  latest: () => SessionMeta | undefined
  sessionId: () => string | undefined
}

export function createWarmSession(data: AppData, connected: () => boolean, queryClient: QueryClient): WarmSession {
  const client = (): QueryClient => queryClient
  const sessions = useQuery(() => ({...data.utils.sessions.list.queryOptions(), enabled: connected()}), client)
  const rows = (): SessionMeta[] => (sessions.isSuccess ? sessions.data : [])
  const latest = (): SessionMeta | undefined => rows().toSorted((a, b) => b.updatedAt - a.updatedAt)[0]
  const warmId = createMemo<string | undefined>((settled) => settled ?? latest()?.id)
  const resolved = useQuery(
    () => ({
      ...data.utils.sessions.resolve.queryOptions({input: {id: warmId()}}),
      enabled: connected() && Boolean(warmId()),
    }),
    client,
  )
  return {rows, latest, sessionId: () => (resolved.isSuccess ? resolved.data.sessionId : undefined)}
}
