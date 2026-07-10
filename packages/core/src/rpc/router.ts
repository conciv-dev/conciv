import {implement} from '@orpc/server'
import {contract, type SessionMeta} from '@conciv/contract'
import type {SessionStore, UiState} from '@conciv/db'
import type {ChatCommands, ChatLaunch, ChatTool, HarnessModelInfo} from '@conciv/protocol/chat-types'
import type {UiAnswerValue} from '@conciv/protocol/ui-types'
import {readLocks} from '../store/lock.js'
import {buildSessionList, resolveSession} from '../api/chat/session.js'
import {ensureChatRecord} from '../api/chat/turn.js'
import {SESSION_BUSY, type Compactor} from '../api/chat/compact.js'
import {attachStream} from '../api/chat/attach.js'
import {pageQueryStream, type PageBus} from '../api/page/page.js'
import type {ChatRuntime} from '../api/chat/chat-env.js'
import type {OpenInEditor} from '../editor/open.js'
import type {OpenSourceFrames, OpenSourceStatus} from '../api/page/open-source.js'
import type {LiveFeed} from './live.js'

export type RpcContext = {request: Request}

export type RpcDeps = {
  store: SessionStore
  buildSessionList: () => Promise<SessionMeta[]>
  live: LiveFeed
  uiState: UiState
  harnessModels: () => Promise<{models: HarnessModelInfo[]; defaultModel: string | null}>
  harnessMeta: {id: string; name: string; canLaunch: boolean}
  harnessKind: string
  cwd: string
  markStopped: (sessionId: string) => void
  killLock: (sessionId: string) => void
  launch: (opts: {sessionId: string; model?: string; origin: string}) => Promise<ChatLaunch>
  commands: (opts: {sessionId?: string; origin: string}) => Promise<ChatCommands>
  tools: ChatTool[]
  openInEditor: OpenInEditor
  openFromFrames: (frames: OpenSourceFrames) => Promise<OpenSourceStatus>
  chat: ChatRuntime
  compactor: Compactor
  sendTurn: (sessionId: string, text: string) => Promise<void>
  decidePermission: (approvalId: string, approved: boolean) => void
  uiReply: (sessionId: string, toolCallId: string, value: UiAnswerValue) => boolean
  pageBus: PageBus
}

function cleanTitle(title: string): string {
  return title
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export async function rpcSessionList(
  chat: ChatRuntime,
  compacting: (sessionId: string) => boolean,
): Promise<SessionMeta[]> {
  const hist = chat.harness.history
  const harnessList =
    chat.harness.capabilities.transcriptHistory && hist?.list ? await hist.list(chat.cwd, chat.claudeHome) : []
  const runningKeys = new Set(readLocks(chat.stateRoot).map((lock) => lock.key))
  const metas = await buildSessionList({store: chat.store, harnessList, runningKeys, cwd: chat.cwd})
  const models = new Map<string, string | null>((await chat.store.list()).map((record) => [record.id, record.model]))
  return metas.map((meta) => ({
    ...meta,
    status: compacting(meta.id) ? ('compacting' as const) : meta.running ? ('running' as const) : ('idle' as const),
    model: models.get(meta.id) ?? null,
  }))
}

const os = implement(contract).$context<RpcContext>()

export function makeRpcRouter(deps: RpcDeps) {
  return os.router({
    sessions: {
      list: os.sessions.list.handler(() => deps.buildSessionList()),
      live: os.sessions.live.handler(async function* ({signal}) {
        yield await deps.buildSessionList()
        for await (const _ of deps.live.subscribe(signal ?? new AbortController().signal)) {
          yield await deps.buildSessionList()
        }
      }),
      create: os.sessions.create.handler(async () => {
        const {sessionId} = await resolveSession({store: deps.store, harnessKind: deps.harnessKind, cwd: deps.cwd}, {})
        await ensureChatRecord(deps.store, sessionId, deps.harnessKind, deps.cwd)
        await deps.uiState.addMarker({sessionId, afterTurn: 0, kind: 'new'})
        return {sessionId}
      }),
      resolve: os.sessions.resolve.handler(async ({input}) => {
        const {sessionId} = await resolveSession(
          {store: deps.store, harnessKind: deps.harnessKind, cwd: deps.cwd},
          input,
        )
        return {sessionId}
      }),
      launch: os.sessions.launch.handler(({input, context}) =>
        deps.launch({sessionId: input.sessionId, model: input.model, origin: new URL(context.request.url).origin}),
      ),
      rename: os.sessions.rename.handler(async ({input, errors}) => {
        if (!(await deps.store.get(input.sessionId))) throw errors.NOT_FOUND()
        const title = cleanTitle(input.title)
        await deps.store.update(input.sessionId, {title})
        return {title}
      }),
      remove: os.sessions.remove.handler(async ({input}) => {
        deps.killLock(input.sessionId)
        await deps.store.delete(input.sessionId)
        await deps.uiState.deleteFor(input.sessionId)
        return {ok: true as const}
      }),
      setModel: os.sessions.setModel.handler(async ({input, errors}) => {
        if (!(await deps.store.get(input.sessionId))) throw errors.NOT_FOUND()
        const {models} = await deps.harnessModels()
        const found = models.find((model) => model.id === input.model && !model.disabled)
        if (!found) throw errors.UNKNOWN_MODEL()
        await deps.store.update(input.sessionId, {model: input.model})
        return {model: input.model}
      }),
      compact: os.sessions.compact.handler(async ({input, errors}) => {
        if (deps.compactor.compacting(input.sessionId) || deps.chat.hub.generating(input.sessionId)) {
          throw errors.BUSY()
        }
        try {
          await deps.compactor.run(input.sessionId)
        } catch (error) {
          if (error instanceof Error && error.message === SESSION_BUSY) throw errors.BUSY()
          throw error
        }
        return {ok: true as const}
      }),
      stop: os.sessions.stop.handler(({input}) => {
        deps.markStopped(input.sessionId)
        deps.killLock(input.sessionId)
        return {ok: true as const}
      }),
    },
    drafts: {
      get: os.drafts.get.handler(({input}) => deps.uiState.getDraft(input.sessionId)),
      set: os.drafts.set.handler(async ({input}) => {
        await deps.uiState.setDraft(input)
        return {ok: true as const}
      }),
      live: os.drafts.live.handler(async function* ({input, signal}) {
        yield await deps.uiState.getDraft(input.sessionId)
        for await (const _ of deps.live.subscribe(signal ?? new AbortController().signal)) {
          yield await deps.uiState.getDraft(input.sessionId)
        }
      }),
    },
    markers: {
      list: os.markers.list.handler(({input}) => deps.uiState.listMarkers(input.sessionId)),
      live: os.markers.live.handler(async function* ({input, signal}) {
        yield await deps.uiState.listMarkers(input.sessionId)
        for await (const _ of deps.live.subscribe(signal ?? new AbortController().signal)) {
          yield await deps.uiState.listMarkers(input.sessionId)
        }
      }),
    },
    chat: {
      attach: os.chat.attach.handler(async function* ({input, signal}) {
        const abort = new AbortController()
        signal?.addEventListener('abort', () => abort.abort(), {once: true})
        try {
          yield* await attachStream(deps.chat, input.sessionId, abort.signal)
        } finally {
          abort.abort()
        }
      }),
      send: os.chat.send.handler(async ({input, errors}) => {
        if (deps.chat.hub.generating(input.sessionId)) throw errors.BUSY()
        try {
          await deps.sendTurn(input.sessionId, input.text)
        } catch (error) {
          if (error instanceof Error && error.message === SESSION_BUSY) throw errors.BUSY()
          throw error
        }
        return {ok: true as const}
      }),
      permissionDecision: os.chat.permissionDecision.handler(({input}) => {
        deps.decidePermission(input.approvalId, input.approved)
        return {ok: true as const}
      }),
      uiReply: os.chat.uiReply.handler(({input, errors}) => {
        if (!deps.uiReply(input.sessionId, input.toolCallId, input.value)) throw errors.UNKNOWN_REQUEST()
        return {ok: true as const}
      }),
    },
    page: {
      queries: os.page.queries.handler(async function* ({signal}) {
        yield* pageQueryStream(deps.pageBus, signal ?? new AbortController().signal)
      }),
      reply: os.page.reply.handler(({input, errors}) => {
        if (!deps.pageBus.resolve(input.requestId, input.data)) throw errors.UNKNOWN_REQUEST()
        return {ok: true as const}
      }),
    },
    editor: {
      open: os.editor.open.handler(({input}) => {
        deps.openInEditor(input.file, input.line)
        return {ok: true as const}
      }),
      openFromFrames: os.editor.openFromFrames.handler(({input}) => deps.openFromFrames(input.frames)),
    },
    meta: {
      models: os.meta.models.handler(async () => {
        const {models, defaultModel} = await deps.harnessModels()
        return {models, defaultModel, harness: deps.harnessMeta}
      }),
      commands: os.meta.commands.handler(({input, context}) =>
        deps.commands({sessionId: input.sessionId, origin: new URL(context.request.url).origin}),
      ),
      tools: os.meta.tools.handler(() => ({tools: deps.tools})),
    },
  })
}
