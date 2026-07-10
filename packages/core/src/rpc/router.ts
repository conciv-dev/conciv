import {implement} from '@orpc/server'
import {contract, type SessionMeta} from '@conciv/contract'
import {resolveHarnessModels} from '@conciv/harness'
import type {ChatTool} from '@conciv/protocol/chat-types'
import {readLocks} from '../store/lock.js'
import {buildSessionList, killLock, listCommands, resolveSession} from '../api/chat/session.js'
import {ensureChatRecord} from '../api/chat/turn.js'
import {launchHarness} from '../api/chat/launch.js'
import {SESSION_BUSY, type Compactor} from '../api/chat/compact.js'
import {attachStream} from '../api/chat/attach.js'
import {pageQueryStream, type PageBus} from '../api/page/page.js'
import type {ChatRuntime} from '../api/chat/chat-env.js'
import type {OpenInEditor} from '../editor/open.js'
import type {OpenSourceFrames, OpenSourceStatus} from '../api/page/open-source.js'
import type {UiState} from '@conciv/db'
import type {LiveFeed} from './live.js'

export type RpcContext = {request: Request}

export type RpcDeps = {
  chat: ChatRuntime
  live: LiveFeed
  uiState: UiState
  tools: ChatTool[]
  compactor: Compactor
  sendTurn: (sessionId: string, text: string) => Promise<void>
  openInEditor: OpenInEditor
  openFromFrames: (frames: OpenSourceFrames) => Promise<OpenSourceStatus>
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
  const {chat, live, uiState, compactor, pageBus} = deps
  const store = chat.store
  const scope = {store, harnessKind: chat.harness.id, cwd: chat.cwd}
  const buildList = () => rpcSessionList(chat, compactor.compacting)
  const releaseSessionLock = (sessionId: string) => killLock(chat.stateRoot, sessionId)
  const harnessMeta = {
    id: chat.harness.id,
    name: chat.harness.displayName ?? chat.harness.id,
    canLaunch: Boolean(chat.harness.launch),
  }
  const harnessModels = async () => {
    const models = await resolveHarnessModels(chat.harness)
    return {models, defaultModel: chat.harness.defaultModel ?? models[0]?.id ?? null}
  }
  return os.router({
    sessions: {
      list: os.sessions.list.handler(() => buildList()),
      live: os.sessions.live.handler(async function* ({signal}) {
        yield await buildList()
        for await (const _ of live.subscribe(signal ?? new AbortController().signal)) {
          yield await buildList()
        }
      }),
      create: os.sessions.create.handler(async () => {
        const {sessionId} = await resolveSession(scope, {})
        await ensureChatRecord(store, sessionId, scope.harnessKind, scope.cwd)
        await uiState.addMarker({sessionId, afterTurn: 0, kind: 'new'})
        return {sessionId}
      }),
      resolve: os.sessions.resolve.handler(async ({input}) => {
        const {sessionId} = await resolveSession(scope, input)
        return {sessionId}
      }),
      launch: os.sessions.launch.handler(({input, context}) =>
        launchHarness(chat, {sessionId: input.sessionId, model: input.model, origin: new URL(context.request.url).origin}),
      ),
      rename: os.sessions.rename.handler(async ({input, errors}) => {
        if (!(await store.get(input.sessionId))) throw errors.NOT_FOUND()
        const title = cleanTitle(input.title)
        await store.update(input.sessionId, {title})
        return {title}
      }),
      remove: os.sessions.remove.handler(async ({input}) => {
        releaseSessionLock(input.sessionId)
        await store.delete(input.sessionId)
        await uiState.deleteFor(input.sessionId)
        return {ok: true as const}
      }),
      setModel: os.sessions.setModel.handler(async ({input, errors}) => {
        if (!(await store.get(input.sessionId))) throw errors.NOT_FOUND()
        const {models} = await harnessModels()
        const found = models.find((model) => model.id === input.model && !model.disabled)
        if (!found) throw errors.UNKNOWN_MODEL()
        await store.update(input.sessionId, {model: input.model})
        return {model: input.model}
      }),
      compact: os.sessions.compact.handler(async ({input, errors}) => {
        if (compactor.compacting(input.sessionId) || chat.hub.generating(input.sessionId)) {
          throw errors.BUSY()
        }
        try {
          await compactor.run(input.sessionId)
        } catch (error) {
          if (error instanceof Error && error.message === SESSION_BUSY) throw errors.BUSY()
          throw error
        }
        return {ok: true as const}
      }),
      stop: os.sessions.stop.handler(({input}) => {
        chat.hub.markStopped(input.sessionId)
        releaseSessionLock(input.sessionId)
        return {ok: true as const}
      }),
    },
    drafts: {
      get: os.drafts.get.handler(({input}) => uiState.getDraft(input.sessionId)),
      set: os.drafts.set.handler(async ({input}) => {
        await uiState.setDraft(input)
        return {ok: true as const}
      }),
      live: os.drafts.live.handler(async function* ({input, signal}) {
        yield await uiState.getDraft(input.sessionId)
        for await (const _ of live.subscribe(signal ?? new AbortController().signal)) {
          yield await uiState.getDraft(input.sessionId)
        }
      }),
    },
    markers: {
      list: os.markers.list.handler(({input}) => uiState.listMarkers(input.sessionId)),
      live: os.markers.live.handler(async function* ({input, signal}) {
        yield await uiState.listMarkers(input.sessionId)
        for await (const _ of live.subscribe(signal ?? new AbortController().signal)) {
          yield await uiState.listMarkers(input.sessionId)
        }
      }),
    },
    chat: {
      attach: os.chat.attach.handler(async function* ({input, signal}) {
        const abort = new AbortController()
        signal?.addEventListener('abort', () => abort.abort(), {once: true})
        try {
          yield* await attachStream(chat, input.sessionId, abort.signal)
        } finally {
          abort.abort()
        }
      }),
      send: os.chat.send.handler(async ({input, errors}) => {
        if (chat.hub.generating(input.sessionId)) throw errors.BUSY()
        try {
          await deps.sendTurn(input.sessionId, input.text)
        } catch (error) {
          if (error instanceof Error && error.message === SESSION_BUSY) throw errors.BUSY()
          throw error
        }
        return {ok: true as const}
      }),
      permissionDecision: os.chat.permissionDecision.handler(({input}) => {
        chat.gate.resolve(input.approvalId, input.approved)
        return {ok: true as const}
      }),
      uiReply: os.chat.uiReply.handler(({input, errors}) => {
        if (!chat.uiAsks.reply(input.sessionId, input.toolCallId, input.value)) throw errors.UNKNOWN_REQUEST()
        return {ok: true as const}
      }),
    },
    page: {
      queries: os.page.queries.handler(async function* ({signal}) {
        yield* pageQueryStream(pageBus, signal ?? new AbortController().signal)
      }),
      reply: os.page.reply.handler(({input, errors}) => {
        if (!pageBus.resolve(input.requestId, input.data)) throw errors.UNKNOWN_REQUEST()
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
        const {models, defaultModel} = await harnessModels()
        return {models, defaultModel, harness: harnessMeta}
      }),
      commands: os.meta.commands.handler(({input, context}) =>
        listCommands(chat, {sessionId: input.sessionId, origin: new URL(context.request.url).origin}),
      ),
      tools: os.meta.tools.handler(() => ({tools: deps.tools})),
    },
  })
}
