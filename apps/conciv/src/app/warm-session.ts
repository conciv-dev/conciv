import {useQuery, type QueryClient} from '@tanstack/solid-query'
import {createMemo} from 'solid-js'
import type {AppData} from '../data/app-data.js'

export type WarmSession = {
  sessionId: () => string | undefined
}

export function createWarmSession(data: AppData, connected: () => boolean, queryClient: QueryClient): WarmSession {
  const client = (): QueryClient => queryClient
  const newest = useQuery(
    () => ({...data.utils.sessions.list.queryOptions({input: {limit: 1}}), enabled: connected()}),
    client,
  )
  const warmId = createMemo<string | undefined>(
    (settled) => settled ?? (newest.isSuccess ? newest.data.sessions[0]?.id : undefined),
  )
  const resolved = useQuery(
    () => ({
      ...data.utils.sessions.resolve.queryOptions({input: {id: warmId()}}),
      enabled: connected() && Boolean(warmId()),
    }),
    client,
  )
  return {sessionId: () => (resolved.isSuccess ? resolved.data.sessionId : undefined)}
}
