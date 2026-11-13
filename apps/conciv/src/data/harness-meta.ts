import {createMemo, type Accessor} from 'solid-js'
import {useQuery} from '@conciv/client'
import type {ChatModels} from '@conciv/protocol/chat-types'
import {useAppData, useAppQueryClient} from '../app/context.js'

export type HarnessMeta = ChatModels['harness']

export function useSessionModels(sessionId: Accessor<string>) {
  const appData = useAppData()
  return useQuery(() => appData.utils.meta.models.queryOptions({input: {sessionId: sessionId()}}))
}

export function useSessionHarness(sessionId: Accessor<string>): Accessor<HarnessMeta | undefined> {
  const models = useSessionModels(sessionId)
  return createMemo(() => (models.isSuccess ? models.data.harness : undefined))
}

export type Harnesses = {
  list: Accessor<HarnessMeta[]>
  switchable: Accessor<boolean>
  resolveName: (harnessId: string) => string
}

export function useHarnesses(): Harnesses {
  const appData = useAppData()
  const harnesses = useQuery(() => appData.utils.meta.harnesses.queryOptions())
  const list = () => (harnesses.isSuccess ? harnesses.data.harnesses : [])
  return {
    list,
    switchable: () => list().length > 1,
    resolveName: (harnessId) => list().find((harness) => harness.id === harnessId)?.name ?? harnessId,
  }
}

export function useRefetchSessionHarness(): (sessionId: string) => Promise<void> {
  const appData = useAppData()
  const queryClient = useAppQueryClient()
  return async (sessionId) => {
    const input = {input: {sessionId}}
    const keys = [
      appData.utils.meta.models.key(input),
      appData.utils.meta.commands.key(input),
      appData.utils.sessions.list.key(),
      appData.utils.sessions.search.key(),
      appData.utils.sessions.get.key(input),
    ]
    await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({queryKey, refetchType: 'all'})))
  }
}
