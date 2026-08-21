import {randomUUID} from 'node:crypto'
import {eq} from 'drizzle-orm'
import type {SessionMeta} from '@conciv/contract'
import {SessionId} from '@conciv/protocol/chat-types'
import {resolveHarnessModels} from '@conciv/harness'
import {clearRunState, deleteSessionCaptures, drafts, markers, modelOf, sessions} from '@conciv/db'
import type {ChatDeps} from '../../chat/runtime.js'
import {
  createRow,
  listSessionMetas,
  openNativeRow,
  resolveRow,
  restoreRow,
  rowById,
  tombstoneRow,
} from '../../chat/session-rows.js'
import {os, type RpcDeps} from './mount.js'

export async function rpcSessionList(chat: ChatDeps, includeHidden: boolean): Promise<SessionMeta[]> {
  const history = chat.harness.history
  const nativeList =
    chat.harness.capabilities.transcriptHistory && history ? await history.list(chat.cwd, chat.claudeHome) : []
  return listSessionMetas({
    db: chat.db,
    harnessKind: chat.harness.id,
    cwd: chat.cwd,
    nativeList,
    running: (sessionId) => chat.liveRuns.running(sessionId),
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
      clearRunState(db, input.sessionId)
      await deleteSessionCaptures(db, input.sessionId)
      return {ok: true as const}
    }),
    model: os.sessions.model.handler(async ({input, errors}) => {
      if (!(await rowById(db, input.sessionId))) throw errors.NOT_FOUND()
      const models = await resolveHarnessModels(chat.harness)
      const found = models.find((model) => model.id === input.model && !model.disabled)
      if (!found) throw errors.UNKNOWN_MODEL()
      await db.update(sessions).set({model: input.model, updatedAt: Date.now()}).where(eq(sessions.id, input.sessionId))
      return {model: input.model}
    }),
    compact: os.sessions.compact.handler(async ({input}) => {
      await deps.runtime.forSession(input.sessionId).run.compact()
      return {ok: true as const}
    }),
  }
}
