import {randomUUID} from 'node:crypto'
import {platform} from 'node:os'
import {and, eq, isNull} from 'drizzle-orm'
import {uniqBy} from 'es-toolkit'
import type {SessionHit} from '@conciv/contract'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import {
  SessionId,
  type HarnessMenuEntry,
  type HarnessSessionId,
  type HarnessMeta,
  type ReasoningEffort,
  type SessionRecord,
} from '@conciv/protocol/chat-types'
import type {HarnessListCursor, HarnessListPage, HarnessSessionMeta} from '@conciv/protocol/harness-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {resolveHarnessModels, type HarnessAdapter} from '@conciv/harness'
import {clearPageChanges, deleteSessionCaptures, drafts, markers, modelOf, sessions} from '@conciv/db'
import {
  createRow,
  ensureRow,
  listSessionMetas,
  openNativeRow,
  sessionMetaOf,
  resolveRow,
  restoreRow,
  rowById,
  switchRowHarness,
  tombstoneRow,
  type NativePage,
} from '../../sessions/session-rows.js'
import {logError} from '../../lib/debug.js'
import {os, type ChatContext, type RpcDeps} from './mount.js'

async function nativePageOf(
  chat: ChatContext,
  harness: HarnessAdapter,
  page: HarnessListPage,
): Promise<NativePage | null> {
  const history = harness.history
  if (!harness.capabilities.transcriptHistory || history === undefined) return null
  try {
    return {harnessKind: harness.id, page: await history.list({cwd: chat.cwd}, page)}
  } catch (error) {
    logError(
      `[core] listing the ${harness.id} native sessions failed, its sessions list from their rows: ${String(error)}`,
    )
    return null
  }
}

async function nativeMetaOf(chat: ChatContext, row: SessionRecord): Promise<HarnessSessionMeta | undefined> {
  const nativeId = row.harnessSessionId
  const history = chat.harnesses.find((harness) => harness.id === row.harnessKind)?.history
  if (nativeId === null || history === undefined) return undefined
  try {
    return (await history.meta(chat.cwd, nativeId)) ?? undefined
  } catch (error) {
    logError(`[core] reading the ${row.harnessKind} native session ${nativeId} failed: ${String(error)}`)
    return undefined
  }
}

async function transcriptOf(
  chat: ChatContext,
  harnessKind: string,
  nativeId: HarnessSessionId,
  cwd: string,
): Promise<ChatMessage[]> {
  const history = chat.harnesses.find((harness) => harness.id === harnessKind)?.history
  if (history === undefined) return []
  if (history.withinProject && !history.withinProject(cwd, nativeId)) return []
  try {
    return await history.messages(cwd, nativeId)
  } catch (error) {
    logError(`[core] previewing the ${harnessKind} native session ${nativeId} failed: ${String(error)}`)
    return []
  }
}

function previewWindow(
  messages: ChatMessage[],
  before: string | null,
  limit: number,
): {messages: ChatMessage[]; earlier: string | null} | null {
  const end = before === null ? messages.length : messages.findIndex((message) => message.id === before)
  if (messages.length === 0 || end < 0) return null
  const start = Math.max(0, end - limit)
  return {messages: messages.slice(start, end), earlier: start > 0 ? (messages[start]?.id ?? null) : null}
}

async function listedPages(chat: ChatContext, page: HarnessListPage): Promise<NativePage[]> {
  const pages = await Promise.all(chat.harnesses.map((harness) => nativePageOf(chat, harness, page)))
  return pages.filter((native) => native !== null)
}

type ListedHit = Omit<SessionHit, 'resume'>

async function sessionPage(
  chat: ChatContext,
  input: {includeHidden?: boolean; cursor?: HarnessListCursor | null; limit: number},
  search: string | null,
  nativePagesOf: (page: HarnessListPage) => Promise<NativePage[]>,
  returned: ListedHit[] = [],
): Promise<{sessions: ListedHit[]; next: HarnessListCursor | null}> {
  const page: HarnessListPage = {after: input.cursor ?? null, limit: input.limit - returned.length}
  const listed = await listSessionMetas({
    db: chat.db,
    cwd: chat.cwd,
    nativePages: await nativePagesOf(page),
    page,
    search,
    running: await chat.plane.running(),
    model: (sessionId) => modelOf(chat.db, sessionId),
    includeHidden: input.includeHidden ?? false,
  })
  const counted = uniqBy([...returned, ...listed.sessions], (session) => session.id)
  if (counted.length >= input.limit || listed.next === null) return {sessions: counted, next: listed.next}
  return sessionPage(chat, {...input, cursor: listed.next}, search, nativePagesOf, counted)
}

function resumeOf(chat: ChatContext, hit: ListedHit): string | null {
  const plan = chat.harnesses.find((harness) => harness.id === hit.harnessKind)?.connect?.plan
  if (hit.cwd === null || hit.native === null || plan === undefined) return null
  const {argv} = plan({
    cwd: hit.cwd,
    stateDir: concivStateDir(hit.cwd),
    concivSessionId: hit.id,
    harnessSessionId: hit.native.nativeId,
    resume: true,
    owned: false,
    model: null,
    mcpUrl: null,
    hookUrl: null,
  })
  if (platform() === 'win32') return `cd /d ${cmdQuote(hit.cwd)} && ${argv.map(cmdQuote).join(' ')}`
  return `cd ${shellQuote(hit.cwd)} && ${argv.map(shellQuote).join(' ')}`
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

function cmdQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function cleanTitle(title: string): string {
  return title
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export function harnessMetaOf(harness: HarnessAdapter): HarnessMeta {
  return {
    id: harness.id,
    name: harness.displayName ?? harness.id,
    canLaunch: Boolean(harness.connect),
    imageInput: harness.capabilities.imageInput,
  }
}

export async function harnessMenuEntryOf(harness: HarnessAdapter): Promise<HarnessMenuEntry> {
  try {
    const models = await resolveHarnessModels(harness)
    return {
      ...harnessMetaOf(harness),
      models,
      defaultModel: harness.defaultModel ?? models[0]?.id ?? null,
      modelsFailed: false,
    }
  } catch (error) {
    logError(`[core] listing the ${harness.id} models failed: ${String(error)}`)
    return {...harnessMetaOf(harness), models: [], defaultModel: harness.defaultModel ?? null, modelsFailed: true}
  }
}

export function sessionsRouter(deps: RpcDeps) {
  const chat = deps.chat
  const db = chat.db
  const scope = {db, harnessKind: chat.defaultHarness.id, cwd: chat.cwd}
  const search = deps.search
  const ensuredRow = async (sessionId: SessionId) => {
    await ensureRow(db, sessionId, scope.harnessKind, scope.cwd)
    return rowById(db, sessionId)
  }
  const sameModel = (model: string | null) => (model === null ? isNull(sessions.model) : eq(sessions.model, model))
  const sameEffort = (effort: ReasoningEffort | null) =>
    effort === null ? isNull(sessions.effort) : eq(sessions.effort, effort)

  async function switchModel(sessionId: SessionId, model: string): Promise<'switched' | 'missing' | 'unknown'> {
    const row = await ensuredRow(sessionId)
    if (!row) return 'missing'
    const models = await resolveHarnessModels(chat.harnessFor(sessionId))
    const found = models.find((candidate) => candidate.id === model && !candidate.disabled)
    if (!found) return 'unknown'
    const effort = row.effort !== null && found.efforts?.includes(row.effort) ? row.effort : null
    const written = await db
      .update(sessions)
      .set({model, effort, updatedAt: Date.now()})
      .where(and(eq(sessions.id, sessionId), eq(sessions.harnessKind, row.harnessKind), sameEffort(row.effort)))
      .returning({id: sessions.id})
    return written.length > 0 ? 'switched' : switchModel(sessionId, model)
  }

  async function switchEffort(
    sessionId: SessionId,
    effort: ReasoningEffort | null,
  ): Promise<'switched' | 'missing' | 'unsupported'> {
    const row = await ensuredRow(sessionId)
    if (!row) return 'missing'
    if (effort !== null) {
      const harness = chat.harnessFor(sessionId)
      const models = await resolveHarnessModels(harness)
      const modelId = row.model ?? harness.defaultModel ?? models[0]?.id
      const current = models.find((model) => model.id === modelId)
      if (!current?.efforts?.includes(effort)) return 'unsupported'
    }
    const written = await db
      .update(sessions)
      .set({effort, updatedAt: Date.now()})
      .where(and(eq(sessions.id, sessionId), eq(sessions.harnessKind, row.harnessKind), sameModel(row.model)))
      .returning({id: sessions.id})
    return written.length > 0 ? 'switched' : switchEffort(sessionId, effort)
  }
  return {
    list: os.sessions.list.handler(async ({input}) => {
      const page = await sessionPage(chat, input, null, (cursorPage) => listedPages(chat, cursorPage))
      search.listed()
      return page
    }),
    changes: os.sessions.changes.handler(({signal}) => search.changes(signal)),
    search: os.sessions.search.handler(async ({input}) => {
      const page = await sessionPage(chat, input, input.term, (cursorPage) =>
        search.pages(input.term, cursorPage, input.everywhere),
      )
      return {...page, sessions: page.sessions.map((hit) => ({...hit, resume: resumeOf(chat, hit)}))}
    }),
    get: os.sessions.get.handler(async ({input, errors}) => {
      const row = await rowById(db, input.sessionId)
      if (!row) throw errors.NOT_FOUND()
      const context = {db, running: await chat.plane.running(), model: (sessionId: SessionId) => modelOf(db, sessionId)}
      return sessionMetaOf(context, {row, native: await nativeMetaOf(chat, row)})
    }),
    preview: os.sessions.preview.handler(async ({input, errors}) => {
      const messages = await transcriptOf(chat, input.harness, input.nativeId, input.cwd ?? chat.cwd)
      const window = previewWindow(messages, input.before, input.limit)
      if (window === null) throw errors.NOT_FOUND()
      if (input.cwd !== undefined) search.cover(input.cwd)
      return window
    }),
    create: os.sessions.create.handler(async () => {
      const sessionId = SessionId.parse(`conciv_${randomUUID()}`)
      await createRow(db, {
        id: sessionId,
        harnessSessionId: null,
        harnessKind: scope.harnessKind,
        origin: 'chat',
        title: null,
        model: null,
        usage: null,
        cwd: scope.cwd,
        deletedAt: null,
      })
      await db.insert(markers).values({id: randomUUID(), sessionId, afterMessageId: null, kind: 'new'})
      return {sessionId}
    }),
    resolve: os.sessions.resolve.handler(({input}) => resolveRow(scope, input)),
    open: os.sessions.open.handler(({input}) => openNativeRow(scope, input)),
    restore: os.sessions.restore.handler(async ({input}) => {
      await restoreRow(db, input.sessionId)
      return {sessionId: input.sessionId}
    }),
    rename: os.sessions.rename.handler(async ({input, errors}) => {
      const row = await rowById(db, input.sessionId)
      if (!row) throw errors.NOT_FOUND()
      const title = cleanTitle(input.title)
      await db.update(sessions).set({title, updatedAt: Date.now()}).where(eq(sessions.id, input.sessionId))
      if (row.harnessSessionId !== null) await search.retitle(row.harnessKind, row.harnessSessionId, title)
      return {title}
    }),
    delete: os.sessions.delete.handler(async ({input}) => {
      await tombstoneRow(db, input.sessionId)
      await db.delete(drafts).where(eq(drafts.sessionId, input.sessionId))
      await chat.plane.clear(input.sessionId)
      await deleteSessionCaptures(db, input.sessionId)
      await clearPageChanges(db, input.sessionId)
      return {ok: true as const}
    }),
    model: os.sessions.model.handler(async ({input, errors}) => {
      const outcome = await switchModel(input.sessionId, input.model)
      if (outcome === 'missing') throw errors.NOT_FOUND()
      if (outcome === 'unknown') throw errors.UNKNOWN_MODEL()
      return {model: input.model}
    }),
    effort: os.sessions.effort.handler(async ({input, errors}) => {
      const outcome = await switchEffort(input.sessionId, input.effort)
      if (outcome === 'missing') throw errors.NOT_FOUND()
      if (outcome === 'unsupported') throw errors.UNSUPPORTED_EFFORT()
      return {effort: input.effort}
    }),
    switchHarness: os.sessions.switchHarness.handler(async ({input, errors}) => {
      const row = await rowById(db, input.sessionId)
      if (!row) throw errors.NOT_FOUND()
      const target = chat.harnesses.find((harness) => harness.id === input.harnessId)
      if (!target) throw errors.UNKNOWN_HARNESS()
      if (row.harnessKind === target.id) return {harnessId: target.id}
      if (await chat.plane.live(input.sessionId)) throw errors.SESSION_RUNNING()
      const model = input.model ?? null
      if (model !== null) {
        const models = await resolveHarnessModels(target)
        if (!models.some((listed) => listed.id === model && !listed.disabled)) throw errors.UNKNOWN_MODEL()
      }
      if (chat.plane.driving(input.sessionId)) throw errors.SESSION_RUNNING()
      switchRowHarness(db, input.sessionId, target.id, model)
      return {harnessId: target.id}
    }),
    compact: os.sessions.compact.handler(async ({input}) => {
      await deps.runtime.forSession(input.sessionId).run.compact()
      return {ok: true as const}
    }),
  }
}
