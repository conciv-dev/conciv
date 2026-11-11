import {useQuery, type QueryClient} from '@tanstack/solid-query'
import {createMemo} from 'solid-js'
import type {AppData} from '../data/app-data.js'

export type WarmSession = {
  sessionId: () => string | undefined
}

export function createWarmSession(data: AppData, connected: () => boolean, queryClient: QueryClient): WarmSession {
  const latest = useQuery(
    () => ({...data.utils.sessions.resolve.queryOptions({input: {}}), enabled: connected()}),
    () => queryClient,
  )
  const warmId = createMemo<string | undefined>(
    (settled) => settled ?? (latest.isSuccess ? latest.data.sessionId : undefined),
  )
  return {sessionId: warmId}
}
