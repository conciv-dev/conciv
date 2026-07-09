import {implement} from '@orpc/server'
import {contract, type SessionMeta} from '@conciv/contract'
import type {SessionStore} from '@conciv/db'
import {readLocks} from '../store/lock.js'
import {buildSessionList} from '../api/chat/session.js'
import type {ChatRuntime} from '../api/chat/chat-env.js'

export type RpcContext = {request: Request}

export type RpcDeps = {
  store: SessionStore
  buildSessionList: () => Promise<SessionMeta[]>
}

export async function rpcSessionList(chat: ChatRuntime): Promise<SessionMeta[]> {
  const hist = chat.harness.history
  const harnessList =
    chat.harness.capabilities.transcriptHistory && hist?.list ? await hist.list(chat.cwd, chat.claudeHome) : []
  const runningKeys = new Set(readLocks(chat.stateRoot).map((lock) => lock.key))
  const metas = await buildSessionList({store: chat.store, harnessList, runningKeys, cwd: chat.cwd})
  const models = new Map<string, string | null>((await chat.store.list()).map((record) => [record.id, record.model]))
  return metas.map((meta) => ({
    ...meta,
    status: meta.running ? ('running' as const) : ('idle' as const),
    model: models.get(meta.id) ?? null,
  }))
}

const os = implement(contract).$context<RpcContext>()

export function makeRpcRouter(deps: RpcDeps) {
  return os.router({
    sessions: {
      list: os.sessions.list.handler(() => deps.buildSessionList()),
      live: os.sessions.live.handler(async function* () {
        yield await deps.buildSessionList()
      }),
      create: os.sessions.create.handler(() => {
        throw new Error('implemented in task 6')
      }),
      resolve: os.sessions.resolve.handler(() => {
        throw new Error('implemented in task 6')
      }),
      launch: os.sessions.launch.handler(() => {
        throw new Error('implemented in task 6')
      }),
      rename: os.sessions.rename.handler(() => {
        throw new Error('implemented in task 6')
      }),
      remove: os.sessions.remove.handler(() => {
        throw new Error('implemented in task 6')
      }),
      setModel: os.sessions.setModel.handler(() => {
        throw new Error('implemented in task 6')
      }),
      compact: os.sessions.compact.handler(() => {
        throw new Error('implemented in task 7')
      }),
      stop: os.sessions.stop.handler(() => {
        throw new Error('implemented in task 6')
      }),
    },
    drafts: {
      get: os.drafts.get.handler(() => {
        throw new Error('implemented in task 5')
      }),
      set: os.drafts.set.handler(() => {
        throw new Error('implemented in task 5')
      }),
      live: os.drafts.live.handler(() => {
        throw new Error('implemented in task 5')
      }),
    },
    markers: {
      list: os.markers.list.handler(() => {
        throw new Error('implemented in task 5')
      }),
      live: os.markers.live.handler(() => {
        throw new Error('implemented in task 5')
      }),
    },
    chat: {
      attach: os.chat.attach.handler(() => {
        throw new Error('implemented in task 8')
      }),
      send: os.chat.send.handler(() => {
        throw new Error('implemented in task 8')
      }),
      permissionDecision: os.chat.permissionDecision.handler(() => {
        throw new Error('implemented in task 8')
      }),
    },
    page: {
      queries: os.page.queries.handler(() => {
        throw new Error('implemented in task 9')
      }),
      reply: os.page.reply.handler(() => {
        throw new Error('implemented in task 9')
      }),
    },
    editor: {
      open: os.editor.open.handler(() => {
        throw new Error('implemented in task 6')
      }),
      openFromFrames: os.editor.openFromFrames.handler(() => {
        throw new Error('implemented in task 6')
      }),
    },
    meta: {
      models: os.meta.models.handler(() => {
        throw new Error('implemented in task 6')
      }),
      commands: os.meta.commands.handler(() => {
        throw new Error('implemented in task 6')
      }),
      tools: os.meta.tools.handler(() => {
        throw new Error('implemented in task 6')
      }),
    },
  })
}
