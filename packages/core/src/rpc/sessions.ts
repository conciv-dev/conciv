import {randomUUID} from 'node:crypto'
import {eq} from 'drizzle-orm'
import type {SessionMeta} from '@conciv/contract'
import {resolveHarnessModels} from '@conciv/harness'
import {clearRunState, drafts, markers, requestStop, sessions, statusOf, type RunStatus} from '@conciv/db'
import {buildSessionList, resolveSession, sessionById} from '../chat/session.js'
import {ensureChatRecord} from '../chat/run.js'
import {launchHarness} from '../chat/launch.js'
import {SESSION_BUSY} from '../chat/compact.js'
import {os, type RpcDeps} from './mount.js'

function wireStatus(status: RunStatus): 'idle' | 'running' | 'compacting' {
  if (status === 'compacting') return 'compacting'
  return status === 'idle' ? 'idle' : 'running'
}

export async function rpcSessionList(deps: RpcDeps): Promise<SessionMeta[]> {
  const chat = deps.chat
  const hist = chat.harness.history
  const harnessList =
    chat.harness.capabilities.transcriptHistory && hist?.list ? await hist.list(chat.cwd, chat.claudeHome) : []
  const metas = await buildSessionList({
    db: chat.db,
    harnessList,
    running: (sessionId) => wireStatus(statusOf(chat.db, sessionId)) === 'running',
    cwd: chat.cwd,
  })
  const rows = await chat.db.select({id: sessions.id, model: sessions.model}).from(sessions)
  const models = new Map(rows.map((row) => [row.id, row.model]))
  return metas.map((meta) => ({
    ...meta,
    status: wireStatus(statusOf(chat.db, meta.id)),
    model: models.get(meta.id) ?? null,
  }))
}

export function sessionsRouter(deps: RpcDeps) {
  const chat = deps.chat
  const db = chat.db
  const scope = {db, harnessKind: chat.harness.id, cwd: chat.cwd}
  const harnessModels = async () => {
    const models = await resolveHarnessModels(chat.harness)
    return {models, defaultModel: chat.harness.defaultModel ?? models[0]?.id ?? null}
  }
  return {
    list: os.sessions.list.handler(() => rpcSessionList(deps)),
    create: os.sessions.create.handler(async () => {
      const {sessionId} = await resolveSession(scope, {})
      await ensureChatRecord(db, sessionId, scope.harnessKind, scope.cwd)
      await db.insert(markers).values({id: randomUUID(), sessionId, afterTurn: 0, kind: 'new'})
      return {sessionId}
    }),
    resolve: os.sessions.resolve.handler(async ({input}) => {
      const {sessionId} = await resolveSession(scope, input)
      return {sessionId}
    }),
    launch: os.sessions.launch.handler(({input, context}) =>
      launchHarness(chat, {
        sessionId: input.sessionId,
        model: input.model,
        origin: new URL(context.request.url).origin,
      }),
    ),
    rename: os.sessions.rename.handler(async ({input, errors}) => {
      if (!(await sessionById(db, input.sessionId))) throw errors.NOT_FOUND()
      const title = cleanTitle(input.title)
      await db.update(sessions).set({title, updatedAt: Date.now()}).where(eq(sessions.id, input.sessionId))
      return {title}
    }),
    remove: os.sessions.remove.handler(async ({input}) => {
      await db.delete(sessions).where(eq(sessions.id, input.sessionId))
      await db.delete(drafts).where(eq(drafts.sessionId, input.sessionId))
      await db.delete(markers).where(eq(markers.sessionId, input.sessionId))
      clearRunState(db, input.sessionId)
      return {ok: true as const}
    }),
    setModel: os.sessions.setModel.handler(async ({input, errors}) => {
      if (!(await sessionById(db, input.sessionId))) throw errors.NOT_FOUND()
      const {models} = await harnessModels()
      const found = models.find((model) => model.id === input.model && !model.disabled)
      if (!found) throw errors.UNKNOWN_MODEL()
      await db.update(sessions).set({model: input.model, updatedAt: Date.now()}).where(eq(sessions.id, input.sessionId))
      return {model: input.model}
    }),
    compact: os.sessions.compact.handler(async ({input, errors}) => {
      try {
        await deps.compactor.run(input.sessionId)
      } catch (error) {
        if (error instanceof Error && error.message === SESSION_BUSY) throw errors.BUSY()
        throw error
      }
      return {ok: true as const}
    }),
    stop: os.sessions.stop.handler(({input}) => {
      requestStop(chat.db, input.sessionId)
      chat.changes.notify()
      return {ok: true as const}
    }),
  }
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
    canLaunch: Boolean(deps.chat.harness.launch),
  }
}
