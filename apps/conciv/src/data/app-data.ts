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
import {Conciv, type ConcivClient} from '@conciv/plugin'
import type {AttachmentState} from '@conciv/ui-kit-chat'
import type {DraftStore} from '../runtime/persistence/drafts.js'
import {DraftRowSchema, SessionMetaSchema, type DraftRow, type RpcClient, type SessionMeta} from '@conciv/contract'

const PendingAttachmentSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  contentType: z.string(),
  file: z.instanceof(File),
})

export const DraftSaveSchema = DraftRowSchema.extend({
  pending: z.array(z.custom<AttachmentState>((value) => PendingAttachmentSchema.safeParse(value).success)).default([]),
})

export type DraftSave = z.input<typeof DraftSaveSchema>

const EncodedAttachmentsSchema = DraftRowSchema.pick({attachments: true})

async function encodeAttachments(pending: readonly AttachmentState[]): Promise<DraftRow['attachments']> {
  if (pending.length === 0) return []
  const {writeComposerDraft} = await import('@conciv/ui-kit-chat')
  const written: string[] = []
  await writeComposerDraft({getItem: () => null, setItem: (_key, value) => written.push(value)}, 'draft', {
    draft: '',
    quote: null,
    attachments: [...pending],
  })
  return EncodedAttachmentsSchema.parse(JSON.parse(written[0] ?? '{}')).attachments
}

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

function retriableDraftSave(failureCount: number, error: unknown): boolean {
  if (failureCount >= DRAFT_SAVE_RETRIES) return false
  return isReachabilityError(error) || (error instanceof ORPCError && error.code === 'INTERNAL_SERVER_ERROR')
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
  dispose: () => void
}

export function makeAppData(rpc: RpcClient, queryClient: QueryClient, drafts: DraftStore | null): AppData {
  const utils = makeQueryUtils(rpc)
  const client = Conciv.make(rpc)
  const listKeys = [utils.sessions.list.key(), utils.sessions.search.key()]
  for (const queryKey of [...listKeys, utils.sessions.get.key()]) {
    queryClient.setQueryDefaults(queryKey, {refetchOnWindowFocus: false})
  }
  queryClient.setQueryDefaults(utils.drafts.get.key(), {staleTime: Infinity, gcTime: Infinity, retry: false})
  const draftQuery = (sessionId: string) => utils.drafts.get.queryOptions({input: {sessionId}})
  queryClient.setMutationDefaults<unknown, Error, DraftSave>(utils.drafts.set.mutationKey(), {
    retry: retriableDraftSave,
    gcTime: Infinity,
    mutationFn: async (input) => {
      const {pending, ...row} = DraftSaveSchema.parse(input)
      const encoded = DraftRowSchema.parse({
        ...row,
        attachments: [...row.attachments, ...(await encodeAttachments(pending))],
      })
      queryClient.setQueryData(draftQuery(encoded.sessionId).queryKey, encoded)
      return rpc.drafts.set(encoded)
    },
    onMutate: async (input) => {
      const {pending, ...row} = DraftSaveSchema.parse(input)
      const {queryKey} = draftQuery(row.sessionId)
      await queryClient.cancelQueries({queryKey})
      const cached = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(
        queryKey,
        pending.length === 0 ? row : {...row, attachments: cached?.attachments ?? row.attachments},
      )
    },
    onError: (error) => {
      console.error('[conciv] could not save the draft', error)
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
  const saveDraft = (save: DraftSave): Promise<boolean> => {
    const observer = new QueryMutationObserver<unknown, Error, DraftSave>(queryClient, {
      mutationKey: utils.drafts.set.mutationKey(),
      scope: {id: save.sessionId},
    })
    return observer
      .mutate(save)
      .then(
        () => true,
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
  const reading = new AbortController()
  const forgetDeletedSessions = async () => {
    for await (const event of client.event.subscribe({signal: reading.signal})) {
      if (event.type !== 'session.deleted') continue
      const sessionId = event.data.sessionID
      await drafts?.removeItem(sessionId).catch((error: unknown) => {
        console.error('[conciv] could not remove the local draft of a deleted session', error)
      })
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
      queryClient.removeQueries({queryKey: sessionKey(sessionId)})
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
    dispose: () => reading.abort(),
  }
}
