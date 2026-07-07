import {readFileSync} from 'node:fs'
import {type H3, HTTPError, readValidatedBody} from 'h3'
import {chat, EventType, type AnyTool, type ModelMessage, type StreamChunk, type TokenUsage} from '@tanstack/ai'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {UiSpecSchema} from '@conciv/protocol/ui-types'
import {ChatRequestSchema, type ChatRequest} from '@conciv/protocol/chat-types'
import {aguiUsageFor, tokenUsageToSnapshot, type UsageSnapshot} from '@conciv/protocol/usage-types'
import {acquireLock, releaseLock} from '../../store/lock.js'
import type {SessionStore} from '../../store/session-store.js'
import type {UiBus} from '../../runtime/ui-bus.js'
import type {TurnHub} from '../../runtime/turn-hub.js'
import type {PermissionGate} from './permission.js'
import {concivSandbox, withConcivGate, withConcivSandbox} from './sandbox.js'
import {tapSessionId} from './stream-effects.js'
import {toChatMessages, toPendingUserMessage} from './messages.js'
import {sessionIdFromHeaders} from './session-id.js'
import {harnessDebug} from '../../runtime/harness-logger.js'

export const resumeTokenFor = async (store: SessionStore, id: string): Promise<string | null> =>
  (await store.get(id))?.harnessSessionId ?? null
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

export type TurnDeps = {
  cwd: string
  stateRoot: string
  harness: HarnessAdapter
  harnessEnv?: (sessionId?: string) => NodeJS.ProcessEnv
  gate: PermissionGate
  systemPromptFile?: string
  systemPromptText?: string
  uiBus: UiBus
  store: SessionStore
  hub: TurnHub
  tools: (sessionId: string) => AnyTool[]
  onTurnStart?: (sessionId: string) => void
  onTurnEnd?: (sessionId: string) => Promise<void>
}

function systemPromptText(deps: TurnDeps, mode: HarnessAdapter['capabilities']['systemPrompt']): string {
  if (mode === 'none') return ''
  if (mode === 'file' && deps.systemPromptFile) {
    try {
      return readFileSync(deps.systemPromptFile, 'utf8')
    } catch {
      return deps.systemPromptText ?? ''
    }
  }
  return deps.systemPromptText ?? ''
}

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
  const resumeSessionId = deps.harness.capabilities.resume ? await resumeTokenFor(deps.store, sessionId) : null
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

async function startTurn(deps: TurnDeps, sessionId: string, chatReq: ChatRequest, sysText: string): Promise<void> {
  const abort = new AbortController()
  const stream = await buildTurnStream(deps, sysText, sessionId, chatReq, abort)
  const requestedModel = requestedModelFor(chatReq) ?? null
  deps.uiBus.setModel(sessionId, requestedModel)
  const merged = deps.uiBus.run(sessionId, stream)
  const lastUserMessage = chatReq.messages.findLast((message) => message.role === 'user') ?? null
  const pendingUserMessage = lastUserMessage ? toPendingUserMessage(lastUserMessage) : null
  const modelId = requestedModel ?? deps.harness.defaultModel ?? null
  void deps.hub
    .start(sessionId, pendingUserMessage, withLockRelease(merged, deps, sessionId, modelId, abort), () =>
      abort.abort(),
    )
    .catch(() => {})
}

export function registerTurnRoutes(app: H3, deps: TurnDeps): void {
  const {harness, uiBus} = deps
  const sysText = systemPromptText(deps, harness.capabilities.systemPrompt)

  app.post('/api/chat/ui', async (event) => {
    const spec = await readValidatedBody(event, UiSpecSchema)
    const sessionId = sessionIdFromHeaders(event.req.headers)
    return {renderId: spec.renderId, injected: sessionId ? uiBus.inject(sessionId, spec) : false}
  })

  app.post('/api/chat', async (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers)
    if (!sessionId) throw new HTTPError({status: 400, message: 'no session (resolve first)'})

    if (deps.hub.generating(sessionId)) throw new HTTPError({status: 409, message: 'session busy'})

    if (!acquireLock(deps.stateRoot, sessionId, 'chat', process.pid)) {
      throw new HTTPError({status: 409, message: 'session busy'})
    }

    try {
      deps.onTurnStart?.(sessionId)
      await ensureChatRecord(deps.store, sessionId, harness.id, deps.cwd)
      const chatReq = await readValidatedBody(event, ChatRequestSchema)
      await startTurn(deps, sessionId, chatReq, sysText)
      return {ok: true}
    } catch (e) {
      releaseLock(deps.stateRoot, sessionId)
      throw e
    }
  })
}

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

function lockReleaser(deps: TurnDeps, sessionId: string): () => void {
  const lock = {held: true}
  return () => {
    if (!lock.held) return
    lock.held = false
    releaseLock(deps.stateRoot, sessionId)
  }
}

async function* withLockRelease(
  src: AsyncIterable<StreamChunk>,
  deps: TurnDeps,
  sessionId: string,
  modelId: string | null,
  abort: AbortController,
): AsyncGenerator<StreamChunk> {
  const release = lockReleaser(deps, sessionId)
  try {
    let finished = false
    for await (const raw of src) {
      const {chunk, usage} = mapTurnChunk(raw, deps, sessionId, modelId, abort.signal.aborted)
      finished = finished || chunk.type === EventType.RUN_FINISHED
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
    if (deps.onTurnEnd) await deps.onTurnEnd(sessionId).catch(() => {})
  }
}
