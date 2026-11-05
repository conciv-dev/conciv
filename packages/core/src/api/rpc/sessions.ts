import {randomUUID} from 'node:crypto'
import {and, eq, isNull} from 'drizzle-orm'
import type {SessionMeta} from '@conciv/contract'
import {SessionId, type ReasoningEffort} from '@conciv/protocol/chat-types'
import {resolveHarnessModels} from '@conciv/harness'
import {clearPageChanges, deleteSessionCaptures, drafts, markers, modelOf, sessions} from '@conciv/db'
import {
  createRow,
  ensureRow,
  listSessionMetas,
  openNativeRow,
  resolveRow,
  restoreRow,
  rowById,
  tombstoneRow,
} from '../../sessions/session-rows.js'
import {os, type ChatContext, type RpcDeps} from './mount.js'

export async function rpcSessionList(chat: ChatContext, includeHidden: boolean): Promise<SessionMeta[]> {
  const history = chat.harness.history
  const nativeList =
    chat.harness.capabilities.transcriptHistory && history ? await history.list(chat.cwd, chat.claudeHome) : []
  return listSessionMetas({
    db: chat.db,
    harnessKind: chat.harness.id,
    cwd: chat.cwd,
    nativeList,
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

export function harnessMetaOf(deps: RpcDeps) {
  return {
    id: deps.chat.harness.id,
    name: deps.chat.harness.displayName ?? deps.chat.harness.id,
    canLaunch: Boolean(deps.chat.harness.connect),
    imageInput: deps.chat.harness.capabilities.imageInput,
  }
}

export function sessionsRouter(deps: RpcDeps) {
  const chat = deps.chat
  const db = chat.db
  const scope = {db, harnessKind: chat.harness.id, cwd: chat.cwd}
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
    const models = await resolveHarnessModels(chat.harness)
    const found = models.find((candidate) => candidate.id === model && !candidate.disabled)
    if (!found) return 'unknown'
    const effort = row.effort !== null && found.efforts?.includes(row.effort) ? row.effort : null
    const written = await db
      .update(sessions)
      .set({model, effort, updatedAt: Date.now()})
      .where(and(eq(sessions.id, sessionId), sameEffort(row.effort)))
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
      const models = await resolveHarnessModels(chat.harness)
      const modelId = row.model ?? chat.harness.defaultModel ?? models[0]?.id
      const current = models.find((model) => model.id === modelId)
      if (!current?.efforts?.includes(effort)) return 'unsupported'
    }
    const written = await db
      .update(sessions)
      .set({effort, updatedAt: Date.now()})
      .where(and(eq(sessions.id, sessionId), sameModel(row.model)))
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
    compact: os.sessions.compact.handler(async ({input}) => {
      await deps.runtime.forSession(input.sessionId).run.compact()
      return {ok: true as const}
    }),
  }
}
