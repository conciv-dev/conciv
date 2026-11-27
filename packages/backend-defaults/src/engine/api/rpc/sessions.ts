import {platform} from 'node:os'
import {Effect} from 'effect'
import {and, eq, isNull} from 'drizzle-orm'
import {uniqBy} from 'es-toolkit'
import type {ContractedRouter} from '@orpc/server'
import {engineErrors, type contract, type SessionHit, type SessionMeta} from '@conciv/protocol'
import {
  SessionId,
  type HarnessLoginStatus,
  type HarnessMenuEntry,
  type HarnessSessionId,
  type HarnessMeta,
  type ReasoningEffort,
  type SessionRecord,
} from '@conciv/types/chat-types'
import type {
  HarnessListCursor,
  HarnessListPage,
  HarnessSessionMeta,
  TranscriptPage,
  TranscriptTailOptions,
} from '@conciv/types/harness-types'
import {resolveHarnessLogin, resolveHarnessModels, type HarnessAdapter} from '@conciv/harness'
import {sessions} from '@conciv/backend-app-api/core/session/sql'
import {
  ensureRow,
  listSessionMetas,
  openNativeRow,
  buildSessionMeta,
  resolveRow,
  restoreRow,
  rowById,
  rowByNativeRef,
  switchRowHarness,
  type NativePage,
} from '../../sessions/session-rows.js'
import type {EngineRuntime} from '../../lib/logging.js'
import {createChatSession, deleteSession, renameSession} from '../../sessions/session-actions.js'
import type {createSessionSearch} from '../../sessions/session-search.js'
import {os, type ChatContext, type EngineRpcContext, type RpcDeps} from './mount.js'
import {inSpan} from '../../../ai.js'

async function loadNativePage(
  chat: ChatContext,
  harness: HarnessAdapter,
  page: HarnessListPage,
): Promise<NativePage | null> {
  const history = harness.history
  if (!harness.capabilities.transcriptHistory || history === undefined) return null
  try {
    const listed = await inSpan(chat.tracer, 'Sessions.listNative', {'conciv.harness.id': harness.id}, () =>
      history.list({cwd: chat.cwd}, page),
    )
    return {harnessKind: harness.id, page: listed}
  } catch (error) {
    chat.runtime.runFork(
      Effect.logError('[core] listing the native sessions failed, its sessions list from their rows', {
        harness: harness.id,
        error,
      }),
    )
    return null
  }
}

async function loadNativeMeta(chat: ChatContext, row: SessionRecord): Promise<HarnessSessionMeta | undefined> {
  const nativeId = row.harnessSessionId
  const history = chat.harnesses.find((harness) => harness.id === row.harnessKind)?.history
  if (nativeId === null || history === undefined) return undefined
  try {
    const meta = await inSpan(chat.tracer, 'Sessions.readNativeMeta', {'conciv.harness.id': row.harnessKind}, () =>
      history.meta(chat.cwd, nativeId),
    )
    return meta ?? undefined
  } catch (error) {
    chat.runtime.runFork(
      Effect.logError('[core] reading a native session failed', {harness: row.harnessKind, nativeId, error}),
    )
    return undefined
  }
}

async function loadTranscriptTail(
  chat: ChatContext,
  harnessKind: string,
  nativeId: HarnessSessionId,
  cwd: string,
  options: TranscriptTailOptions,
): Promise<TranscriptPage | null> {
  const history = chat.harnesses.find((harness) => harness.id === harnessKind)?.history
  if (history === undefined)
    return loadSavedPage(chat, await rowByNativeRef(chat.db, {harnessKind, cwd, nativeId}), options)
  if (history.withinProject && !(await history.withinProject(cwd, nativeId))) return null
  try {
    return await inSpan(chat.tracer, 'Sessions.readTranscriptTail', {'conciv.harness.id': harnessKind}, () =>
      history.tail(cwd, nativeId, options),
    )
  } catch (error) {
    if (options.signal?.aborted) throw error
    chat.runtime.runFork(
      Effect.logError('[core] previewing a native session failed', {harness: harnessKind, nativeId, error}),
    )
    return null
  }
}

async function loadSavedPage(
  chat: ChatContext,
  row: SessionRecord | null,
  options: TranscriptTailOptions,
): Promise<TranscriptPage | null> {
  if (row === null) return null
  const {messages, page} = await chat.plane.hydrate(row.id, {
    limit: options.limit,
    ...(options.before === null ? {} : {before: options.before}),
  })
  return {messages, earlier: page?.truncated ? page.cursor : null}
}

async function listedPages(chat: ChatContext, page: HarnessListPage): Promise<NativePage[]> {
  const pages = await Promise.all(chat.harnesses.map((harness) => loadNativePage(chat, harness, page)))
  return pages.filter((native) => native !== null)
}

type ListedHit = Omit<SessionHit, 'resume'>

export async function rpcSessionMeta(chat: ChatContext, sessionId: SessionId): Promise<SessionMeta | null> {
  const row = await rowById(chat.db, sessionId)
  if (!row) return null
  const context = {db: chat.db, running: await chat.plane.running()}
  return buildSessionMeta(context, {row, native: await loadNativeMeta(chat, row)})
}

async function sessionPage(
  chat: ChatContext,
  input: SessionPageInput,
  search: string | null,
  loadNativePages: (page: HarnessListPage) => Promise<NativePage[]>,
  returned: ListedHit[] = [],
): Promise<{sessions: ListedHit[]; next: HarnessListCursor | null}> {
  const page: HarnessListPage = {after: input.cursor ?? null, limit: input.limit - returned.length}
  const listed = await listSessionMetas({
    db: chat.db,
    cwd: chat.cwd,
    publishCreated: chat.rows.publishCreated,
    ids: chat.rows.ids,
    nativePages: await loadNativePages(page),
    page,
    search,
    running: await chat.plane.running(),
    includeHidden: input.includeHidden ?? false,
    runtime: chat.runtime,
  })
  const counted = uniqBy([...returned, ...listed.sessions], (session) => session.id)
  if (counted.length >= input.limit || listed.next === null) return {sessions: counted, next: listed.next}
  return sessionPage(chat, {...input, cursor: listed.next}, search, loadNativePages, counted)
}

function formatResume(chat: ChatContext, hit: ListedHit): string | null {
  const resume = chat.harnesses.find((harness) => harness.id === hit.harnessKind)?.resume
  if (hit.cwd === null || hit.native === null || resume === undefined) return null
  const {bin, args} = resume.command({cwd: hit.cwd, nativeId: hit.native.nativeId})
  const argv = [bin, ...args]
  if (platform() === 'win32') return `cd /d ${cmdQuote(hit.cwd)} && ${argv.map(cmdQuote).join(' ')}`
  return `cd ${shellQuote(hit.cwd)} && ${argv.map(shellQuote).join(' ')}`
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function cmdQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function buildHarnessMeta(harness: HarnessAdapter): HarnessMeta {
  return {
    id: harness.id,
    name: harness.displayName ?? harness.id,
    imageInput: harness.capabilities.imageInput,
    persistentPty: harness.tty !== undefined,
  }
}

function readHarnessLogin(
  harness: HarnessAdapter,
  signal: AbortSignal,
  runtime: EngineRuntime,
): Promise<HarnessLoginStatus> {
  return resolveHarnessLogin(harness, {
    signal,
    refresh: true,
    onError: (error) => {
      if (!signal.aborted)
        runtime.runFork(Effect.logError('[core] checking the login failed', {harness: harness.id, error}))
    },
  })
}

async function listMenuModels(
  harness: HarnessAdapter,
  signal: AbortSignal,
  runtime: EngineRuntime,
): Promise<Pick<HarnessMenuEntry, 'models' | 'defaultModel' | 'modelsFailed'>> {
  try {
    const models = await resolveHarnessModels(harness, {signal})
    return {models, defaultModel: (await harness.defaultModel?.()) ?? models[0]?.id ?? null, modelsFailed: false}
  } catch (error) {
    if (!signal.aborted)
      runtime.runFork(Effect.logError('[core] listing the models failed', {harness: harness.id, error}))
    return {models: [], defaultModel: (await harness.defaultModel?.()) ?? null, modelsFailed: true}
  }
}

export async function buildHarnessMenuEntry(
  harness: HarnessAdapter,
  signal: AbortSignal,
  runtime: EngineRuntime,
): Promise<HarnessMenuEntry> {
  const [listed, login] = await Promise.all([
    listMenuModels(harness, signal, runtime),
    readHarnessLogin(harness, signal, runtime),
  ])
  return {...buildHarnessMeta(harness), ...listed, login}
}

const sameModel = (model: string | null) => (model === null ? isNull(sessions.model) : eq(sessions.model, model))

const sameEffort = (effort: ReasoningEffort | null) =>
  effort === null ? isNull(sessions.effort) : eq(sessions.effort, effort)

async function ensuredRow(chat: ChatContext, sessionId: SessionId): Promise<SessionRecord | null> {
  await ensureRow(chat.rows, sessionId)
  return rowById(chat.db, sessionId)
}

export function switchSessionModel(
  chat: ChatContext,
  sessionId: SessionId,
  model: string,
): Effect.Effect<'switched' | 'missing' | 'unknown'> {
  return Effect.gen(function* () {
    const row = yield* Effect.promise(() => ensuredRow(chat, sessionId))
    if (!row) return 'missing' as const
    const models = yield* Effect.promise(async () =>
      resolveHarnessModels(await chat.harnessFor(sessionId), {signal: chat.signal}),
    )
    const found = models.find((candidate) => candidate.id === model && !candidate.disabled)
    if (!found) return 'unknown' as const
    const effort = row.effort !== null && found.efforts?.includes(row.effort) ? row.effort : null
    const written = yield* chat.db
      .update(sessions)
      .set({model, effort, updatedAt: Date.now()})
      .where(and(eq(sessions.id, sessionId), eq(sessions.harnessKind, row.harnessKind), sameEffort(row.effort)))
      .returning({id: sessions.id})
      .pipe(Effect.orDie)
    if (written.length > 0) return 'switched' as const
    return yield* switchSessionModel(chat, sessionId, model)
  })
}

export function switchSessionEffort(
  chat: ChatContext,
  sessionId: SessionId,
  effort: ReasoningEffort | null,
): Effect.Effect<'switched' | 'missing' | 'unsupported'> {
  return Effect.gen(function* () {
    const row = yield* Effect.promise(() => ensuredRow(chat, sessionId))
    if (!row) return 'missing' as const
    if (effort !== null) {
      const supported = yield* Effect.promise(async () => {
        const harness = await chat.harnessFor(sessionId)
        const models = await resolveHarnessModels(harness, {signal: chat.signal})
        const modelId = row.model ?? (await harness.defaultModel?.()) ?? models[0]?.id
        return models.find((model) => model.id === modelId)?.efforts?.includes(effort) === true
      })
      if (!supported) return 'unsupported' as const
    }
    const written = yield* chat.db
      .update(sessions)
      .set({effort, updatedAt: Date.now()})
      .where(and(eq(sessions.id, sessionId), eq(sessions.harnessKind, row.harnessKind), sameModel(row.model)))
      .returning({id: sessions.id})
      .pipe(Effect.orDie)
    if (written.length > 0) return 'switched' as const
    return yield* switchSessionEffort(chat, sessionId, effort)
  })
}

type SessionSearch = ReturnType<typeof createSessionSearch>

type SessionPageInput = {includeHidden?: boolean; cursor?: HarnessListCursor | null; limit: number}

export async function listedSessionPage(
  chat: ChatContext,
  search: Pick<SessionSearch, 'listed'>,
  input: SessionPageInput,
): Promise<{sessions: ListedHit[]; next: HarnessListCursor | null}> {
  const page = await sessionPage(chat, input, null, (cursorPage) => listedPages(chat, cursorPage))
  search.listed()
  return page
}

export function searchedSessionPage(
  chat: ChatContext,
  search: Pick<SessionSearch, 'pages'>,
  input: SessionPageInput & {term: string; everywhere: boolean},
): Promise<{sessions: ListedHit[]; next: HarnessListCursor | null}> {
  return sessionPage(chat, input, input.term, (cursorPage) => search.pages(input.term, cursorPage, input.everywhere))
}

export function sessionsRouter(deps: RpcDeps): ContractedRouter<typeof contract.sessions, EngineRpcContext> {
  const chat = deps.chat
  const db = chat.db
  const scope = chat.rows
  const search = deps.search
  return {
    list: os.sessions.list.effect(function* ({input}) {
      return yield* Effect.promise(() => listedSessionPage(chat, search, input))
    }),
    changes: os.sessions.changes.effect(function* ({signal}) {
      return yield* Effect.sync(() => search.changes(signal))
    }),
    search: os.sessions.search.effect(function* ({input}) {
      const page = yield* Effect.promise(() => searchedSessionPage(chat, search, input))
      return {...page, sessions: page.sessions.map((hit) => ({...hit, resume: formatResume(chat, hit)}))}
    }),
    get: os.sessions.get.effect(function* ({input}) {
      const meta = yield* Effect.promise(() => rpcSessionMeta(chat, input.sessionId))
      if (meta === null) return yield* Effect.fail(engineErrors.NOT_FOUND())
      return meta
    }),
    preview: os.sessions.preview.effect(function* ({input, signal}) {
      const options = {limit: input.limit, before: input.before, signal}
      const page = yield* Effect.promise(async () =>
        'sessionId' in input
          ? loadSavedPage(chat, await rowById(db, input.sessionId), options)
          : loadTranscriptTail(chat, input.harness, input.nativeId, input.cwd ?? chat.cwd, options),
      )
      if (page === null || (page.messages.length === 0 && page.earlier === null && input.before === null)) {
        return yield* Effect.fail(engineErrors.NOT_FOUND())
      }
      if ('cwd' in input && input.cwd !== undefined) search.cover(input.cwd)
      return page
    }),
    create: os.sessions.create.effect(function* () {
      return yield* Effect.promise(async () => {
        const {sessionId} = await createChatSession(scope)
        const session = await rpcSessionMeta(chat, sessionId)
        if (session === null) throw engineErrors.SESSION_VANISHED({sessionId})
        return {sessionId, session}
      })
    }),
    resolve: os.sessions.resolve.effect(function* ({input}) {
      const resolved = yield* Effect.promise(() => resolveRow(scope, input))
      if (resolved === null) return yield* Effect.fail(engineErrors.NOT_FOUND())
      return resolved
    }),
    open: os.sessions.open.effect(function* ({input}) {
      const opened = yield* Effect.promise(() => openNativeRow(scope, input))
      if (opened === null) return yield* Effect.fail(engineErrors.NOT_FOUND())
      return opened
    }),
    restore: os.sessions.restore.effect(function* ({input}) {
      yield* Effect.promise(() => restoreRow(db, input.sessionId))
      return {sessionId: input.sessionId}
    }),
    rename: os.sessions.rename.effect(function* ({input}) {
      const outcome = yield* Effect.promise(() =>
        renameSession({db, search, pluginHost: deps.pluginHost}, input.sessionId, input.title),
      )
      if (outcome === 'missing') return yield* Effect.fail(engineErrors.NOT_FOUND())
      return outcome
    }),
    delete: os.sessions.delete.effect(function* ({input}) {
      yield* Effect.promise(() =>
        deleteSession({db, plane: chat.plane, runtime: deps.runtime, pluginHost: deps.pluginHost}, input.sessionId),
      )
      return {ok: true as const}
    }),
    model: os.sessions.model.effect(function* ({input}) {
      const outcome = yield* switchSessionModel(chat, input.sessionId, input.model)
      if (outcome === 'missing') return yield* Effect.fail(engineErrors.NOT_FOUND())
      if (outcome === 'unknown') return yield* Effect.fail(engineErrors.UNKNOWN_MODEL())
      return {model: input.model}
    }),
    effort: os.sessions.effort.effect(function* ({input}) {
      const outcome = yield* switchSessionEffort(chat, input.sessionId, input.effort)
      if (outcome === 'missing') return yield* Effect.fail(engineErrors.NOT_FOUND())
      if (outcome === 'unsupported') return yield* Effect.fail(engineErrors.UNSUPPORTED_EFFORT())
      return {effort: input.effort}
    }),
    switchHarness: os.sessions.switchHarness.effect(function* ({input}) {
      const row = yield* Effect.promise(() => rowById(db, input.sessionId))
      if (!row) return yield* Effect.fail(engineErrors.NOT_FOUND())
      const target = chat.harnesses.find((harness) => harness.id === input.harnessId)
      if (!target) return yield* Effect.fail(engineErrors.UNKNOWN_HARNESS())
      if (row.harnessKind === target.id) return {harnessId: target.id}
      if (yield* Effect.promise(() => chat.plane.live(input.sessionId)))
        return yield* Effect.fail(engineErrors.SESSION_RUNNING())
      const model = input.model ?? null
      if (model !== null) {
        const models = yield* Effect.promise(() => resolveHarnessModels(target, {signal: chat.signal}))
        if (!models.some((listed) => listed.id === model && !listed.disabled))
          return yield* Effect.fail(
            engineErrors.UNKNOWN_MODEL({message: 'the target harness does not offer that model'}),
          )
      }
      if (chat.plane.driving(input.sessionId)) return yield* Effect.fail(engineErrors.SESSION_RUNNING())
      yield* Effect.promise(() => switchRowHarness(db, input.sessionId, target.id, model))
      return {harnessId: target.id}
    }),
    compact: os.sessions.compact.effect(function* ({input}) {
      const row = yield* Effect.promise(() => rowById(db, input.sessionId))
      if (row === null || row.deletedAt !== null) return yield* Effect.fail(engineErrors.NOT_FOUND())
      yield* Effect.promise(() => deps.runtime.forSession(input.sessionId).run.compact())
      return {ok: true as const}
    }),
  }
}
