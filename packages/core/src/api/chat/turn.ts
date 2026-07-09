import {existsSync, readFileSync} from 'node:fs'
import {Hono} from 'hono'
import {HTTPException} from 'hono/http-exception'
import {zValidator} from '@hono/zod-validator'
import {chat, EventType, type ModelMessage, type StreamChunk, type TokenUsage} from '@tanstack/ai'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {UiSpecSchema} from '@conciv/protocol/ui-types'
import {ChatRequestSchema, type ChatRequest, type Ok} from '@conciv/protocol/chat-types'
import {aguiUsageFor, tokenUsageToSnapshot, type UsageSnapshot} from '@conciv/protocol/usage-types'
import {acquireLock, releaseLock} from '../../store/lock.js'
import type {SessionStore} from '../../store/session-store.js'
import type {ChatEnv, ChatRuntime} from './chat-env.js'
import {concivSandbox, withConcivGate, withConcivSandbox} from './sandbox.js'
import {tapSessionId} from './stream-effects.js'
import {toChatMessages, toPendingUserMessage} from './messages.js'
import {sessionIdFromHeaders} from './session-id.js'
import {harnessDebug, logError} from '../../runtime/harness-logger.js'

export const resumeTokenFor = async (store: SessionStore, id: string): Promise<string | null> =>
  (await store.get(id))?.harnessSessionId ?? null

export function resumableToken(
  harness: HarnessAdapter,
  cwd: string,
  token: string | null,
  home?: string,
): string | null {
  if (!token) return null
  const history = harness.history
  if (!history) return token
  return existsSync(history.transcriptPath(cwd, token, home)) ? token : null
}
export const recordMintedToken = (store: SessionStore, id: string, token: string): Promise<unknown> =>
  store.update(id, {harnessSessionId: token})

export const ensureChatRecord = async (
  store: SessionStore,
  id: string,
  harnessKind: string,
  cwd: string,
): Promise<void> => {
  if (await store.get(id)) return
  await store.create({
    id,
    harnessSessionId: null,
    harnessKind,
    origin: 'chat',
    title: null,
    model: null,
    usage: null,
    cwd,
  })
}

const COMPACT_FALLBACK_PROMPT =
  'Summarize our conversation so far as concisely as you can: the key decisions, the current state, and any open threads, so we can continue with less context.'

export type SystemPromptSources = {systemPromptFile?: string; systemPromptText?: string}

export function resolveSystemText(
  sources: SystemPromptSources,
  mode: HarnessAdapter['capabilities']['systemPrompt'],
): string {
  if (mode === 'none') return ''
  if (mode === 'file' && sources.systemPromptFile) {
    try {
      return readFileSync(sources.systemPromptFile, 'utf8')
    } catch {
      return sources.systemPromptText ?? ''
    }
  }
  return sources.systemPromptText ?? ''
}

type TurnDeps = ChatRuntime

function requestedModelFor(chatReq: ChatRequest): string | undefined {
  return chatReq.model ?? chatReq.forwardedProps?.model ?? chatReq.data?.model
}

function turnKindFor(chatReq: ChatRequest): 'chat' | 'compact' {
  const intent = chatReq.intent ?? chatReq.forwardedProps?.intent ?? chatReq.data?.intent ?? 'chat'
  return intent === 'compact' ? 'compact' : 'chat'
}

function turnMessages(chatReq: ChatRequest, turnKind: 'chat' | 'compact', deps: TurnDeps): ModelMessage[] {
  const messages = toChatMessages(chatReq)
  if (turnKind !== 'compact' || deps.harness.capabilities.compaction) return messages
  const lastUser = messages.findLast((message) => message.role === 'user')
  if (lastUser) lastUser.content = COMPACT_FALLBACK_PROMPT
  return messages
}

async function buildTurnStream(
  deps: TurnDeps,
  sysText: string,
  sessionId: string,
  chatReq: ChatRequest,
  abort: AbortController,
): Promise<AsyncIterable<StreamChunk>> {
  const turnKind = turnKindFor(chatReq)
  const resumeSessionId = deps.harness.capabilities.resume
    ? resumableToken(deps.harness, deps.cwd, await resumeTokenFor(deps.store, sessionId), deps.claudeHome)
    : null
  const config = deps.harness.chatConfig({
    cwd: deps.cwd,
    sessionId,
    resumeSessionId,
    model: requestedModelFor(chatReq),
    env: deps.harnessEnv?.(sessionId) ?? process.env,
    kind: turnKind,
    decide: (toolName, input, toolUseId) => deps.gate.decide(toolName, input, sessionId, toolUseId),
  })
  const messages = turnMessages(chatReq, turnKind, deps)
  return chat({
    adapter: config.adapter,
    messages: config.prepareMessages?.(messages) ?? messages,
    systemPrompts: sysText ? [sysText] : [],
    threadId: sessionId,
    tools: deps.tools(sessionId),
    modelOptions: config.modelOptions,
    middleware: [withConcivSandbox(concivSandbox(deps.cwd)), withConcivGate(deps.gate, sessionId)],
    abortController: abort,
    debug: harnessDebug,
  })
}

async function startTurn(
  deps: TurnDeps,
  sessionId: string,
  chatReq: ChatRequest,
  onSettled?: () => void,
): Promise<void> {
  const abort = new AbortController()
  const stream = await buildTurnStream(deps, deps.systemText, sessionId, chatReq, abort)
  const requestedModel = requestedModelFor(chatReq) ?? null
  deps.uiBus.setModel(sessionId, requestedModel)
  const merged = deps.uiBus.run(sessionId, stream)
  const lastUserMessage = chatReq.messages.findLast((message) => message.role === 'user') ?? null
  const pendingUserMessage = lastUserMessage ? toPendingUserMessage(lastUserMessage) : null
  const modelId = requestedModel ?? deps.harness.defaultModel ?? null
  void deps.hub
    .start(
      sessionId,
      pendingUserMessage,
      withLockRelease(merged, deps, sessionId, modelId, abort, turnKindFor(chatReq), onSettled),
      () => abort.abort(),
    )
    .catch(() => {})
}

const app = new Hono<ChatEnv>()
  .post('/ui', zValidator('json', UiSpecSchema), (c) => {
    const spec = c.req.valid('json')
    const sessionId = sessionIdFromHeaders(c.req.raw.headers)
    return c.json({renderId: spec.renderId, injected: sessionId ? c.var.chat.uiBus.inject(sessionId, spec) : false})
  })
  .post('/', zValidator('json', ChatRequestSchema), async (c) => {
    const deps = c.var.chat
    const sessionId = sessionIdFromHeaders(c.req.raw.headers)
    if (!sessionId) throw new HTTPException(400, {message: 'no session (resolve first)'})

    if (deps.hub.generating(sessionId)) throw new HTTPException(409, {message: 'session busy'})

    if (!acquireLock(deps.stateRoot, sessionId, 'chat', process.pid)) {
      throw new HTTPException(409, {message: 'session busy'})
    }

    try {
      deps.onTurnStart?.(sessionId)
      await ensureChatRecord(deps.store, sessionId, deps.harness.id, deps.cwd)
      await deps.store.setStatus(sessionId, turnKindFor(c.req.valid('json')) === 'compact' ? 'compacting' : 'thinking')
      await startTurn(deps, sessionId, c.req.valid('json'))
      const payload: Ok = {ok: true}
      return c.json(payload)
    } catch (e) {
      releaseLock(deps.stateRoot, sessionId)
      await deps.store.setStatus(sessionId, 'idle').catch((error) => logError(`[core] status reset failed: ${String(error)}`))
      throw e
    }
  })
  .post('/compact', async (c) => {
    const deps = c.var.chat
    const sessionId = sessionIdFromHeaders(c.req.raw.headers)
    if (!sessionId) throw new HTTPException(400, {message: 'no session (resolve first)'})
    if (deps.hub.generating(sessionId)) throw new HTTPException(409, {message: 'session busy'})
    if (!acquireLock(deps.stateRoot, sessionId, 'chat', process.pid)) {
      throw new HTTPException(409, {message: 'session busy'})
    }
    let markerId: string | null = null
    try {
      deps.onTurnStart?.(sessionId)
      await ensureChatRecord(deps.store, sessionId, deps.harness.id, deps.cwd)
      markerId = await deps.markers.create(sessionId, 'compact', 0)
      await deps.store.setStatus(sessionId, 'compacting')
      const chatReq: ChatRequest = ChatRequestSchema.parse({
        messages: [{role: 'user', content: '/compact'}],
        intent: 'compact',
      })
      const settled = markerId
      await startTurn(
        deps,
        sessionId,
        chatReq,
        () => void deps.markers.settle(settled).catch((error) => logError(`[core] marker settle failed: ${String(error)}`)),
      )
      const payload: Ok = {ok: true}
      return c.json(payload)
    } catch (error) {
      releaseLock(deps.stateRoot, sessionId)
      if (markerId) {
        await deps.markers.remove(markerId).catch((e) => logError(`[core] marker cleanup failed: ${String(e)}`))
      }
      await deps.store.setStatus(sessionId, 'idle').catch((e) => logError(`[core] status reset failed: ${String(e)}`))
      throw error
    }
  })

export default app

function contextWindowFor(harness: HarnessAdapter, modelId: string | null): number | undefined {
  const models = harness.models
  if (!Array.isArray(models) || !modelId) return undefined
  return models.find((model) => model.id === modelId)?.contextWindow
}

function usageSnapshotFor(deps: TurnDeps, modelId: string | null, usage: TokenUsage): UsageSnapshot {
  const contextWindow = contextWindowFor(deps.harness, modelId)
  return {
    ...tokenUsageToSnapshot(usage),
    ...(modelId ? {modelId} : {}),
    ...(contextWindow ? {contextWindow} : {}),
  }
}

function isTerminal(chunk: StreamChunk): boolean {
  return chunk.type === EventType.RUN_FINISHED || chunk.type === EventType.RUN_ERROR
}

function stopFinishedFor(sessionId: string): StreamChunk {
  return {type: EventType.RUN_FINISHED, threadId: sessionId, runId: sessionId, finishReason: 'stop'}
}

function mapTurnChunk(
  chunk: StreamChunk,
  deps: TurnDeps,
  sessionId: string,
  modelId: string | null,
  aborted: boolean,
): {chunk: StreamChunk; usage: UsageSnapshot | null} {
  const mapped = chunk.type === EventType.RUN_ERROR && aborted ? stopFinishedFor(sessionId) : chunk
  tapSessionId(mapped, (id) => void recordMintedToken(deps.store, sessionId, id).catch(() => {}))
  const usage =
    mapped.type === EventType.RUN_FINISHED && mapped.usage ? usageSnapshotFor(deps, modelId, mapped.usage) : null
  return {chunk: mapped, usage}
}

const STREAM_STARTERS = new Set<string>([
  EventType.TEXT_MESSAGE_CONTENT,
  EventType.TEXT_MESSAGE_CHUNK,
  EventType.TOOL_CALL_START,
  EventType.TOOL_CALL_CHUNK,
])

function lockReleaser(deps: TurnDeps, sessionId: string): () => void {
  const lock = {held: true}
  return () => {
    if (!lock.held) return
    lock.held = false
    releaseLock(deps.stateRoot, sessionId)
    void deps.store.setStatus(sessionId, 'idle').catch((error) => logError(`[core] status reset failed: ${String(error)}`))
  }
}

async function* withLockRelease(
  src: AsyncIterable<StreamChunk>,
  deps: TurnDeps,
  sessionId: string,
  modelId: string | null,
  abort: AbortController,
  turnKind: 'chat' | 'compact',
  onSettled?: () => void,
): AsyncGenerator<StreamChunk> {
  const release = lockReleaser(deps, sessionId)
  try {
    let finished = false
    let streamed = false
    for await (const raw of src) {
      const {chunk, usage} = mapTurnChunk(raw, deps, sessionId, modelId, abort.signal.aborted)
      finished = finished || chunk.type === EventType.RUN_FINISHED
      if (!streamed && turnKind !== 'compact' && STREAM_STARTERS.has(chunk.type)) {
        streamed = true
        void deps.store.setStatus(sessionId, 'streaming').catch((error) => logError(`[core] status flip failed: ${String(error)}`))
      }
      if (usage) {
        yield aguiUsageFor(usage)
        await deps.store.update(sessionId, {usage})
      }
      if (isTerminal(chunk)) release()
      yield chunk
    }
    if (!finished && abort.signal.aborted) {
      release()
      yield stopFinishedFor(sessionId)
    }
  } finally {
    release()
    onSettled?.()
    if (deps.onTurnEnd) await deps.onTurnEnd(sessionId).catch(() => {})
  }
}
