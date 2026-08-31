import {createContext, createMemo, useContext, type Accessor} from 'solid-js'
import {useQuery, type QueryClient} from '@tanstack/solid-query'
import type {ChatModels} from '@conciv/protocol/chat-types'
import type {AppData} from './app-data.js'

export type HarnessMeta = ChatModels['harness']

export const HarnessMetaContext = createContext<Accessor<HarnessMeta | undefined>>()

export function createHarnessMeta(
  data: AppData,
  connected: () => boolean,
  queryClient: QueryClient,
): Accessor<HarnessMeta | undefined> {
  const models = useQuery(
    () => ({...data.utils.meta.models.queryOptions(), enabled: connected()}),
    () => queryClient,
  )
  const harness = createMemo(() => models.data?.harness)
  return harness
}

export function useHarnessMeta(): Accessor<HarnessMeta | undefined> {
  const value = useContext(HarnessMetaContext)
  if (!value) throw new Error('useHarnessMeta called outside the app provider')
  return value
}
