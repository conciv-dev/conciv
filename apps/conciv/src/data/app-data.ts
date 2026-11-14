import {z} from 'zod'
import {MutationObserver, makeQueryUtils, type QueryUtils, type QueryClient, type QueryKey} from '@conciv/client'
import {DraftRowSchema, type DraftRow, type RpcClient} from '@conciv/contract'

type DraftInput = Omit<z.input<typeof DraftRowSchema>, 'updatedAt'>

export type AppData = {
  utils: QueryUtils
  invalidateSessions: () => Promise<void>
  invalidateSession: (sessionId: string) => Promise<void>
  invalidateOutsideAccess: () => Promise<void>
  readDraft: (sessionId: string) => Promise<DraftRow | null>
  cachedDraft: (sessionId: string) => DraftRow | null | undefined
  saveDraft: (row: DraftInput) => Promise<void>
}

export function makeAppData(rpc: RpcClient, queryClient: QueryClient): AppData {
  const utils = makeQueryUtils(rpc)
  const listKeys = [utils.sessions.list.key(), utils.sessions.search.key()]
  for (const queryKey of [...listKeys, utils.sessions.get.key()]) {
    queryClient.setQueryDefaults(queryKey, {refetchOnWindowFocus: false})
  }
  queryClient.setQueryDefaults(utils.drafts.get.key(), {staleTime: Infinity, gcTime: Infinity, retry: false})
  const draftQuery = (sessionId: string) => utils.drafts.get.queryOptions({input: {sessionId}})
  const saveDraft = (row: DraftInput): Promise<void> => {
    const observer = new MutationObserver(
      queryClient,
      utils.drafts.set.mutationOptions({
        scope: {id: row.sessionId},
        onMutate: (input) => {
          queryClient.setQueryData(
            draftQuery(input.sessionId).queryKey,
            DraftRowSchema.parse({...input, updatedAt: Date.now()}),
          )
        },
        onError: (error) => {
          console.error('[conciv] could not save the draft', error)
        },
      }),
    )
    return observer
      .mutate(row)
      .then(() => undefined)
      .finally(() => observer.reset())
  }
  const invalidate = async (queryKeys: QueryKey[]) => {
    await Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({queryKey})))
  }
  return {
    utils,
    invalidateSessions: () => invalidate([...listKeys, utils.sessions.get.key()]),
    invalidateSession: (sessionId) => invalidate([...listKeys, utils.sessions.get.key({input: {sessionId}})]),
    invalidateOutsideAccess: () => queryClient.invalidateQueries({queryKey: utils.chat.outsideAccess.key()}),
    readDraft: (sessionId) => queryClient.ensureQueryData(draftQuery(sessionId)),
    cachedDraft: (sessionId) => queryClient.getQueryData(draftQuery(sessionId).queryKey),
    saveDraft,
  }
}
