import {randomUUID} from 'node:crypto'
import {and, eq, isNull} from 'drizzle-orm'
import type {SessionMeta} from '@conciv/contract'
import {SessionId, type HarnessMenuEntry, type HarnessMeta, type ReasoningEffort} from '@conciv/protocol/chat-types'
import {resolveHarnessModels, type HarnessAdapter} from '@conciv/harness'
import {clearPageChanges, deleteSessionCaptures, drafts, markers, modelOf, sessions} from '@conciv/db'
import {
  createRow,
  ensureRow,
  listSessionMetas,
  openNativeRow,
  resolveRow,
  restoreRow,
  rowById,
  switchRowHarness,
  tombstoneRow,
  type NativeList,
} from '../../sessions/session-rows.js'
import {logError} from '../../lib/debug.js'
import {os, type ChatContext, type RpcDeps} from './mount.js'

async function nativeListOf(chat: ChatContext, harness: HarnessAdapter): Promise<NativeList> {
  const history = harness.history
  if (!harness.capabilities.transcriptHistory || history === undefined) return {harnessKind: harness.id, list: []}
  try {
    return {harnessKind: harness.id, list: await history.list(chat.cwd, chat.claudeHome)}
  } catch (error) {
    logError(`[core] listing the ${harness.id} native sessions failed: ${String(error)}`)
    return {harnessKind: harness.id, list: []}
  }
}

export async function rpcSessionList(chat: ChatContext, includeHidden: boolean): Promise<SessionMeta[]> {
  return listSessionMetas({
    db: chat.db,
    cwd: chat.cwd,
    nativeLists: await Promise.all(chat.harnesses.map((harness) => nativeListOf(chat, harness))),
    running: await chat.plane.running(),
    model: (sessionId) => modelOf(chat.db, sessionId),
    includeHidden,
  })
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
    list: os.sessions.list.handler(({input}) => rpcSessionList(chat, input?.includeHidden ?? false)),
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
      await db.insert(markers).values({id: randomUUID(), sessionId, afterTurn: 0, kind: 'new'})
      return {sessionId}
    }),
    resolve: os.sessions.resolve.handler(({input}) => resolveRow(scope, input)),
    open: os.sessions.open.handler(({input}) => openNativeRow(scope, input)),
    restore: os.sessions.restore.handler(async ({input}) => {
      await restoreRow(db, input.sessionId)
      return {sessionId: input.sessionId}
    }),
    rename: os.sessions.rename.handler(async ({input, errors}) => {
      if (!(await rowById(db, input.sessionId))) throw errors.NOT_FOUND()
      const title = cleanTitle(input.title)
      await db.update(sessions).set({title, updatedAt: Date.now()}).where(eq(sessions.id, input.sessionId))
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
      switchRowHarness(db, input.sessionId, target.id, model)
      return {harnessId: target.id}
    }),
    compact: os.sessions.compact.handler(async ({input}) => {
      await deps.runtime.forSession(input.sessionId).run.compact()
      return {ok: true as const}
    }),
  }
}
