import {z} from 'zod'
import {difference} from 'es-toolkit'
import {ORPCError} from '@orpc/client'
import {
  QueryMutationObserver,
  isReachabilityError,
  makeQueryUtils,
  type QueryUtils,
  type QueryClient,
  type QueryKey,
} from '@conciv/client'
import {Conciv, type ConcivClient} from '@conciv/plugin'
import type {DraftStore} from '../runtime/persistence/drafts.js'
import {Definition as PageDefinition} from '@conciv/plugin-page/rpc'
import {DraftRowSchema, SessionMetaSchema, type DraftRow, type RpcClient, type SessionMeta} from '@conciv/contract'

const PendingAttachmentSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  file: z.instanceof(File),
})

export type DraftSave = z.input<typeof DraftRowSchema>

export type PendingDraftAttachment = z.infer<typeof PendingAttachmentSchema>

const DraftSessionSchema = z.object({sessionId: z.string()})

type SessionPage = Awaited<ReturnType<RpcClient['sessions']['list']>>

function withoutSessionOnPage<Page extends {sessions: readonly {id: string}[]}>(page: Page, sessionId: string): Page {
  if (!page.sessions.some((session) => session.id === sessionId)) return page
  return {...page, sessions: page.sessions.filter((session) => session.id !== sessionId)}
}

function withoutSessionInPages<Pages extends {pages: readonly {sessions: readonly {id: string}[]}[]}>(
  data: Pages | undefined,
  sessionId: string,
): Pages | undefined {
  if (!data?.pages.some((page) => page.sessions.some((session) => session.id === sessionId))) return data
  return {...data, pages: data.pages.map((page) => withoutSessionOnPage(page, sessionId))}
}

const DRAFT_SAVE_RETRIES = 3

const SETTLED: readonly string[] = ['error', 'success']

function retriableDraftSave(failureCount: number, error: unknown): boolean {
  if (failureCount >= DRAFT_SAVE_RETRIES) return false
  return isReachabilityError(error) || (error instanceof ORPCError && error.code === 'INTERNAL_SERVER_ERROR')
}

export function sessionCapturesCall(sessionId: string) {
  return {rpcId: PageDefinition.id, method: 'captures.list', input: {sessionId}}
}

export type AppData = {
  utils: QueryUtils
  client: ConcivClient
  drafts: DraftStore | null
  invalidateSessions: () => Promise<void>
  invalidateSession: (sessionId: string) => Promise<void>
  seedSession: (row: SessionMeta) => Promise<void>
  createSession: () => Promise<{sessionId: string}>
  invalidateOutsideAccess: () => Promise<void>
  readDraft: (sessionId: string) => Promise<DraftRow | null>
  cachedDraft: (sessionId: string) => DraftRow | null | undefined
  saveDraft: (save: DraftSave) => Promise<boolean>
  sessionDeleted: (sessionId: string) => boolean
  forgetGoneDrafts: (shown: readonly string[]) => Promise<void>
  forgetLocalDrafts: () => Promise<void>
  lockedOut: () => boolean
  dispose: () => void
}

export function makeAppData(
  rpc: RpcClient,
  queryClient: QueryClient,
  drafts: DraftStore | null,
  lockedOut: () => boolean,
): AppData {
  const utils = makeQueryUtils(rpc)
  const client = Conciv.make(rpc)
  const listKeys = [utils.sessions.list.key(), utils.sessions.search.key()]
  for (const queryKey of [...listKeys, utils.sessions.get.key()]) {
    queryClient.setQueryDefaults(queryKey, {refetchOnWindowFocus: false})
  }
  queryClient.setQueryDefaults(utils.drafts.get.key(), {staleTime: Infinity, gcTime: Infinity, retry: false})
  const draftQuery = (sessionId: string) => utils.drafts.get.queryOptions({input: {sessionId}})
  const removeDraftSaves = (
    forget: (save: {status: string; isPaused: boolean; variables: unknown}) => boolean,
  ): void => {
    const mutationCache = queryClient.getMutationCache()
    const forgotten = mutationCache.findAll({
      mutationKey: utils.drafts.set.mutationKey(),
      predicate: (mutation) => forget(mutation.state),
    })
    for (const mutation of forgotten) mutationCache.remove(mutation)
  }
  const forgetDraftSaves = (sessionId: string, statuses: readonly string[]): void =>
    removeDraftSaves(
      (save) =>
        statuses.includes(save.status) && DraftSessionSchema.safeParse(save.variables).data?.sessionId === sessionId,
    )
  queryClient.setMutationDefaults<unknown, Error, DraftSave>(utils.drafts.set.mutationKey(), {
    retry: retriableDraftSave,
    gcTime: Infinity,
    mutationFn: async (input) => {
      if (lockedOut()) return null
      const row = DraftRowSchema.parse(input)
      const held = queryClient.getQueryData(draftQuery(row.sessionId).queryKey)
      if (!held || held.updatedAt !== row.updatedAt) return null
      queryClient.setQueryData(draftQuery(row.sessionId).queryKey, row)
      return rpc.drafts.set(row)
    },
    onMutate: async (input) => {
      if (lockedOut()) return
      const row = DraftRowSchema.parse(input)
      forgetDraftSaves(row.sessionId, ['error'])
      const {queryKey} = draftQuery(row.sessionId)
      await queryClient.cancelQueries({queryKey})
      queryClient.setQueryData(queryKey, row)
    },
    onError: (error, input) => {
      console.error('[conciv] could not save the draft', error)
      forgetDraftSaves(input.sessionId, ['error'])
    },
    onSuccess: (answer, input) => {
      forgetDraftSaves(input.sessionId, answer === null ? ['error'] : SETTLED)
    },
    onSettled: (_data, _error, input) =>
      queryClient.invalidateQueries({queryKey: draftQuery(input.sessionId).queryKey}),
  })
  const saveDraft = (save: DraftSave): Promise<boolean> => {
    const observer = new QueryMutationObserver<unknown, Error, DraftSave>(queryClient, {
      mutationKey: utils.drafts.set.mutationKey(),
      scope: {id: save.sessionId},
    })
    return observer
      .mutate(save)
      .then(
        (answer) => answer !== null,
        () => false,
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
  type ListedPages<Procedure extends 'list' | 'search'> = NonNullable<
    ReturnType<typeof queryClient.getQueryData<unknown, ReturnType<(typeof utils.sessions)[Procedure]['infiniteKey']>>>
  >
  const endDraftSaves = (sessionId: string): void => {
    queryClient.setQueryData(draftQuery(sessionId).queryKey, null)
    forgetDraftSaves(sessionId, SETTLED)
  }
  const sessionGone = (sessionId: string): Promise<boolean> =>
    rpc.sessions.get({sessionId}).then(
      (meta) => meta.hidden,
      (error: unknown) => {
        console.error(`[conciv] could not check session ${sessionId}, so its local draft stays`, error)
        return false
      },
    )
  const forgetGoneDraft = async (sessionId: string): Promise<void> => {
    if (!drafts || !(await sessionGone(sessionId))) return
    await drafts.removeItem(sessionId).catch((error: unknown) => {
      console.error('[conciv] could not remove the local draft of a gone session', error)
    })
  }
  const forgetGoneDrafts = async (shown: readonly string[]): Promise<void> => {
    if (!drafts) return
    const kept = await drafts.keys().catch((error: unknown) => {
      console.error('[conciv] could not list the local drafts', error)
      return []
    })
    await difference(kept, shown).reduce(
      (checked, sessionId) => checked.then(() => forgetGoneDraft(sessionId)),
      Promise.resolve(),
    )
  }
  const forgetLocalDrafts = async (): Promise<void> => {
    queryClient.removeQueries({queryKey: utils.drafts.get.key()})
    removeDraftSaves((save) => !save.isPaused)
    if (!drafts) return
    await drafts.clear().catch((error: unknown) => {
      console.error('[conciv] could not empty the local draft store', error)
    })
  }
  const reading = new AbortController()
  const forgetDeletedSessions = async () => {
    for await (const event of client.event.subscribe({signal: reading.signal})) {
      if (event.type !== 'session.deleted') continue
      const sessionId = event.data.sessionID
      queryClient.setQueryData(sessionKey(sessionId), (meta) => meta && {...meta, hidden: true})
      endDraftSaves(sessionId)
      queryClient.setQueriesData<SessionPage>({queryKey: utils.sessions.list.key({type: 'query'})}, (data) =>
        data ? withoutSessionOnPage(data, sessionId) : data,
      )
      queryClient.setQueriesData<ListedPages<'list'>>({queryKey: utils.sessions.list.key({type: 'infinite'})}, (data) =>
        withoutSessionInPages(data, sessionId),
      )
      queryClient.setQueriesData<ListedPages<'search'>>(
        {queryKey: utils.sessions.search.key({type: 'infinite'})},
        (data) => withoutSessionInPages(data, sessionId),
      )
    }
  }
  forgetDeletedSessions().catch((error: unknown) => {
    if (!reading.signal.aborted) console.error('[conciv] stopped reading session deletions', error)
  })
  return {
    utils,
    client,
    drafts,
    invalidateSessions: () => invalidate([...listKeys, utils.sessions.get.key()]),
    invalidateSession,
    seedSession,
    createSession,
    invalidateOutsideAccess: () => queryClient.invalidateQueries({queryKey: utils.chat.outsideAccess.key()}),
    readDraft: (sessionId) => queryClient.ensureQueryData(draftQuery(sessionId)),
    cachedDraft: (sessionId) => queryClient.getQueryData(draftQuery(sessionId).queryKey),
    saveDraft,
    forgetGoneDrafts,
    forgetLocalDrafts,
    lockedOut,
    sessionDeleted: (sessionId) => queryClient.getQueryData(sessionKey(sessionId))?.hidden === true,
    dispose: () => reading.abort(),
  }
}
