import {z} from 'zod'
import {ORPCError} from '@orpc/client'
import {
  QueryMutationObserver,
  isReachabilityError,
  makeQueryUtils,
  type QueryUtils,
  type QueryClient,
  type QueryKey,
} from '@conciv/client'
import {DraftRowSchema, SessionMetaSchema, type DraftRow, type RpcClient, type SessionMeta} from '@conciv/contract'

type DraftInput = Omit<z.input<typeof DraftRowSchema>, 'updatedAt'>

const DraftSessionSchema = z.object({sessionId: z.string()})

type DraftSaveContext = {previous: DraftRow | null | undefined}

const DRAFT_SAVE_RETRIES = 3

function retriableDraftSave(failureCount: number, error: unknown): boolean {
  if (failureCount >= DRAFT_SAVE_RETRIES) return false
  return isReachabilityError(error) || (error instanceof ORPCError && error.code === 'INTERNAL_SERVER_ERROR')
}

export type AppData = {
  utils: QueryUtils
  invalidateSessions: () => Promise<void>
  invalidateSession: (sessionId: string) => Promise<void>
  seedSession: (row: SessionMeta) => Promise<void>
  createSession: () => Promise<{sessionId: string}>
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
  queryClient.setMutationDefaults<unknown, Error, DraftInput, DraftSaveContext>(utils.drafts.set.mutationKey(), {
    retry: retriableDraftSave,
    gcTime: Infinity,
    onMutate: async (input) => {
      const {queryKey} = draftQuery(input.sessionId)
      await queryClient.cancelQueries({queryKey})
      const previous = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, DraftRowSchema.parse({...input, updatedAt: Date.now()}))
      return {previous}
    },
    onError: (error, input, context) => {
      console.error('[conciv] could not save the draft', error)
      const {queryKey} = draftQuery(input.sessionId)
      if (context?.previous === undefined) {
        queryClient.removeQueries({queryKey, exact: true})
        return
      }
      queryClient.setQueryData(queryKey, context.previous)
    },
    onSuccess: (_data, input) => {
      const mutationCache = queryClient.getMutationCache()
      const settled = mutationCache.findAll({
        mutationKey: utils.drafts.set.mutationKey(),
        predicate: (mutation) =>
          mutation.state.status !== 'pending' &&
          DraftSessionSchema.safeParse(mutation.state.variables).data?.sessionId === input.sessionId,
      })
      for (const mutation of settled) mutationCache.remove(mutation)
    },
    onSettled: (_data, _error, input) =>
      queryClient.invalidateQueries({queryKey: draftQuery(input.sessionId).queryKey}),
  })
  const saveDraft = (row: DraftInput): Promise<void> => {
    const observer = new QueryMutationObserver(
      queryClient,
      utils.drafts.set.mutationOptions({scope: {id: row.sessionId}}),
    )
    return observer
      .mutate(row)
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => observer.reset())
  }
  const invalidate = async (queryKeys: QueryKey[]) => {
    await Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({queryKey})))
  }
  const sessionKey = (sessionId: string) => utils.sessions.get.queryKey({input: {sessionId}})
  const seed = (row: SessionMeta) => {
    const queryKey = sessionKey(row.id)
    if (queryClient.getQueryData(queryKey) === undefined)
      queryClient.setQueryData(queryKey, SessionMetaSchema.parse(row))
  }
  const seedSession = async (row: SessionMeta): Promise<void> => {
    seed(row)
    await queryClient.invalidateQueries({queryKey: sessionKey(row.id)})
  }
  const invalidateSession = (sessionId: string) =>
    invalidate([...listKeys, utils.sessions.get.key({input: {sessionId}})])
  const createSession = async (): Promise<{sessionId: string}> => {
    const {sessionId, session} = await rpc.sessions.create(undefined)
    seed(session)
    void invalidateSession(sessionId)
    return {sessionId}
  }
  return {
    utils,
    invalidateSessions: () => invalidate([...listKeys, utils.sessions.get.key()]),
    invalidateSession,
    seedSession,
    createSession,
    invalidateOutsideAccess: () => queryClient.invalidateQueries({queryKey: utils.chat.outsideAccess.key()}),
    readDraft: (sessionId) => queryClient.ensureQueryData(draftQuery(sessionId)),
    cachedDraft: (sessionId) => queryClient.getQueryData(draftQuery(sessionId).queryKey),
    saveDraft,
  }
}
