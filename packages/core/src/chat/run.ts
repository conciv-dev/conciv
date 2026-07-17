import {randomUUID} from 'node:crypto'
import {existsSync, readFileSync} from 'node:fs'
import {eq} from 'drizzle-orm'
import {chat, EventType, StreamProcessor, type ModelMessage, type StreamChunk, type TokenUsage} from '@tanstack/ai'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {ChatMessageSchema, type ChatContentPart, type ChatMessage} from '@conciv/protocol/chat-types'
import {tokenUsageToSnapshot, type UsageSnapshot} from '@conciv/protocol/usage-types'
import {
  claimRun,
  clearImageHistory,
  drafts,
  foldRunMessagesIntoImageHistory,
  markers,
  releaseRun,
  sessions,
  setRunMessages,
  statusOf,
  type ConcivDb,
} from '@conciv/db'
import type {ChatDeps} from './runtime.js'
import {createSession, sessionById, toModelMessages} from './session.js'
import {mergedMessages, transcriptMessages} from './attach.js'
import {makeRunGate, withConcivGate, withConcivSandbox} from './gate.js'
import {harnessDebug} from '../lib/debug.js'

export type RunRequest = {messages: ModelMessage[]; model: string | null; kind: 'chat' | 'compact'}

export const SESSION_BUSY = 'session busy'

export const resumeTokenFor = async (db: ConcivDb, id: string): Promise<string | null> =>
  (await sessionById(db, id))?.harnessSessionId ?? null

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

export const recordMintedToken = (db: ConcivDb, id: string, token: string): Promise<unknown> =>
  db.update(sessions).set({harnessSessionId: token, updatedAt: Date.now()}).where(eq(sessions.id, id))

export const ensureChatRecord = async (db: ConcivDb, id: string, harnessKind: string, cwd: string): Promise<void> => {
  if (await sessionById(db, id)) return
  await createSession(db, {
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

function runMessagesFor(deps: ChatDeps, req: RunRequest): ModelMessage[] {
  if (req.kind !== 'compact' || deps.harness.capabilities.compaction) return req.messages
  const lastUser = req.messages.findLast((message) => message.role === 'user')
  if (lastUser) lastUser.content = COMPACT_FALLBACK_PROMPT
  return req.messages
}

async function buildRunStream(
  deps: ChatDeps,
  sessionId: string,
  req: RunRequest,
  processor: StreamProcessor,
  abort: AbortController,
): Promise<AsyncIterable<StreamChunk>> {
  const resumeSessionId = deps.harness.capabilities.resume
    ? resumableToken(deps.harness, deps.cwd, await resumeTokenFor(deps.db, sessionId), deps.claudeHome)
    : null
  const gate = makeRunGate({sessionId, processor, db: deps.db, changes: deps.changes, risky: deps.risky})
  const config = deps.harness.chatConfig({
    cwd: deps.cwd,
    sessionId,
    resumeSessionId,
    model: req.model ?? undefined,
    env: deps.harnessEnv?.(sessionId) ?? process.env,
    kind: req.kind,
    decide: (toolName, input, toolUseId) => gate.decide(toolName, input, sessionId, toolUseId),
  })
  const messages = runMessagesFor(deps, req)
  return chat({
    adapter: config.adapter,
    messages: config.prepareMessages?.(messages) ?? messages,
    systemPrompts: deps.systemText ? [deps.systemText] : [],
    threadId: sessionId,
    tools: deps.tools(sessionId),
    modelOptions: config.modelOptions,
    middleware: [withConcivSandbox(deps.sandbox), withConcivGate(gate, sessionId)],
    abortController: abort,
    debug: harnessDebug,
  })
}

function watchForStop(deps: ChatDeps, sessionId: string, abort: AbortController): () => void {
  const check = (): void => {
    if (statusOf(deps.db, sessionId) === 'stopping') abort.abort()
  }
  deps.changes.emitter.on('change', check)
  check()
  return () => deps.changes.emitter.off('change', check)
}

async function recordRunEnd(deps: ChatDeps, sessionId: string, usage: UsageSnapshot | null): Promise<void> {
  if (!(await sessionById(deps.db, sessionId))) return
  await deps.db
    .update(sessions)
    .set({...(usage ? {usage} : {}), updatedAt: Date.now()})
    .where(eq(sessions.id, sessionId))
}

type RunOutcome = {error: string | null; usage: UsageSnapshot | null}

async function foldRunStream(
  deps: ChatDeps,
  sessionId: string,
  req: RunRequest,
  processor: StreamProcessor,
  stream: AsyncIterable<StreamChunk>,
  outcome: RunOutcome,
): Promise<void> {
  for await (const chunk of stream) {
    processor.processChunk(chunk)
    tapSessionId(chunk, (id) => void recordMintedToken(deps.db, sessionId, id).catch(() => {}))
    if (chunk.type === EventType.RUN_ERROR) {
      outcome.error = chunk.message || 'run failed'
      return
    }
    if (chunk.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls' && chunk.usage) {
      outcome.usage = usageSnapshotFor(deps, req.model ?? deps.harness.defaultModel ?? null, chunk.usage)
    }
  }
}

function persistRunOutcome(deps: ChatDeps, sessionId: string, kind: RunRequest['kind']): void {
  if (kind === 'chat') {
    foldRunMessagesIntoImageHistory(deps.db, sessionId)
    return
  }
  clearImageHistory(deps.db, sessionId)
}

const FIRST_CHUNK_TIMEOUT_MS = 30_000

async function firstOrTimeout(
  iterator: AsyncIterator<StreamChunk>,
  timeoutMs: number,
): Promise<IteratorResult<StreamChunk> | 'timeout'> {
  const timer = {handle: null as ReturnType<typeof setTimeout> | null}
  const first = await Promise.race([
    iterator.next(),
    new Promise<'timeout'>((resolve) => {
      timer.handle = setTimeout(() => resolve('timeout'), timeoutMs)
    }),
  ])
  if (timer.handle) clearTimeout(timer.handle)
  return first
}

async function* boundFirstChunk(
  stream: AsyncIterable<StreamChunk>,
  timeoutMs: number,
  onTimeout: () => void,
): AsyncGenerator<StreamChunk> {
  const iterator = stream[Symbol.asyncIterator]()
  const first = await firstOrTimeout(iterator, timeoutMs)
  if (first === 'timeout') {
    onTimeout()
    void iterator.return?.(undefined)?.catch?.(() => {})
    return
  }
  if (first.done) return
  yield first.value
  yield* {[Symbol.asyncIterator]: () => iterator}
}

export async function startRun(deps: ChatDeps, sessionId: string, req: RunRequest): Promise<void> {
  const abort = new AbortController()
  const processor = new StreamProcessor({
    events: {
      onMessagesChange: (messages) => {
        setRunMessages(deps.db, sessionId, messages)
        deps.changes.notify()
      },
    },
  })
  const lastUser = req.messages.findLast((message) => message.role === 'user')
  if (lastUser?.content != null) processor.addUserMessage(lastUser.content)
  const unwatch = watchForStop(deps, sessionId, abort)
  const outcome: RunOutcome = {error: null, usage: null}
  try {
    const stream = await buildRunStream(deps, sessionId, req, processor, abort)
    const timeoutMs = deps.firstChunkTimeoutMs ?? FIRST_CHUNK_TIMEOUT_MS
    const bounded = boundFirstChunk(stream, timeoutMs, () => {
      outcome.error = `${deps.harness.id} produced no output within ${Math.round(timeoutMs / 1000)}s`
      abort.abort()
    })
    await foldRunStream(deps, sessionId, req, processor, bounded, outcome)
  } catch (error) {
    if (!abort.signal.aborted) outcome.error = error instanceof Error ? error.message : String(error)
  } finally {
    unwatch()
    persistRunOutcome(deps, sessionId, req.kind)
    await recordRunEnd(deps, sessionId, outcome.usage).catch(() => {})
    releaseRun(deps.db, sessionId, outcome.error)
    deps.changes.notify()
    if (deps.onRunEnd) await deps.onRunEnd(sessionId).catch(() => {})
  }
}

function contextWindowFor(harness: HarnessAdapter, modelId: string | null): number | undefined {
  const models = harness.models
  if (!Array.isArray(models) || !modelId) return undefined
  return models.find((model) => model.id === modelId)?.contextWindow
}

function usageSnapshotFor(deps: ChatDeps, modelId: string | null, usage: TokenUsage): UsageSnapshot {
  const contextWindow = contextWindowFor(deps.harness, modelId)
  return {
    ...tokenUsageToSnapshot(usage),
    ...(modelId ? {modelId} : {}),
    ...(contextWindow ? {contextWindow} : {}),
  }
}

export function tapSessionId(chunk: StreamChunk, onSessionId: (id: string) => void): void {
  if (chunk.type !== EventType.CUSTOM || !chunk.name.endsWith('.session-id')) return
  const value = chunk.value
  if (typeof value === 'object' && value !== null && 'sessionId' in value && typeof value.sessionId === 'string') {
    onSessionId(value.sessionId)
  }
}

export type UserContent = string | ChatContentPart[]

async function composeUserContent(db: ConcivDb, sessionId: string, content: UserContent): Promise<UserContent> {
  const rows = await db.select({grabs: drafts.grabs}).from(drafts).where(eq(drafts.sessionId, sessionId))
  const grabs = rows[0]?.grabs ?? []
  if (grabs.length === 0) return content
  const prefix = grabs.join('\n')
  if (typeof content === 'string') return content ? `${prefix}\n${content}` : prefix
  return [{type: 'text', content: `${prefix}\n`}, ...content]
}

async function historyFor(deps: ChatDeps, sessionId: string): Promise<ChatMessage[]> {
  const resumable =
    deps.harness.capabilities.resume &&
    resumableToken(deps.harness, deps.cwd, await resumeTokenFor(deps.db, sessionId), deps.claudeHome) !== null
  if (resumable) return []
  return (await mergedMessages(deps, sessionId)).map((message) => ChatMessageSchema.parse(message))
}

export function makeSend(deps: ChatDeps): (sessionId: string, content: UserContent) => Promise<void> {
  return async (sessionId, content) => {
    if (!claimRun(deps.db, sessionId, 'chat')) throw new Error(SESSION_BUSY)
    deps.changes.notify()
    try {
      deps.onRunStart?.(sessionId)
      await ensureChatRecord(deps.db, sessionId, deps.harness.id, deps.cwd)
      const userContent = await composeUserContent(deps.db, sessionId, content)
      const model = (await sessionById(deps.db, sessionId))?.model ?? null
      const history = await historyFor(deps, sessionId)
      const messages = toModelMessages([...history, {role: 'user', content: userContent}])
      void startRun(deps, sessionId, {messages, model, kind: 'chat'})
      await deps.db.delete(drafts).where(eq(drafts.sessionId, sessionId))
      deps.changes.notify()
    } catch (error) {
      releaseRun(deps.db, sessionId, null)
      deps.changes.notify()
      throw error
    }
  }
}

export type Compactor = {run: (sessionId: string) => Promise<void>}

async function addCompactMarker(db: ConcivDb, sessionId: string, afterTurn: number): Promise<void> {
  await db.insert(markers).values({id: randomUUID(), sessionId, afterTurn, kind: 'compact'})
}

export function makeCompactor(deps: ChatDeps): Compactor {
  async function run(sessionId: string): Promise<void> {
    if (!claimRun(deps.db, sessionId, 'compact')) throw new Error(SESSION_BUSY)
    deps.changes.notify()
    try {
      deps.onRunStart?.(sessionId)
      const history = await transcriptMessages(deps, sessionId)
      await addCompactMarker(deps.db, sessionId, history.length)
      deps.changes.notify()
    } catch (error) {
      releaseRun(deps.db, sessionId, null)
      deps.changes.notify()
      throw error
    }
    await startRun(deps, sessionId, {
      messages: toModelMessages([{role: 'user', content: '/compact'}]),
      model: null,
      kind: 'compact',
    })
  }

  return {run}
}
