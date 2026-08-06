import {randomUUID} from 'node:crypto'
import {existsSync, readFileSync} from 'node:fs'
import {eq} from 'drizzle-orm'
import {
  chat,
  EventType,
  RUN_ACCEPTED_EVENT,
  StreamProcessor,
  type AnyTool,
  type ContentPart,
  type ModelMessage,
  type StreamChunk,
  type TokenUsage,
  type UIMessage,
} from '@tanstack/ai'
import type {HarnessAdapter, HarnessChatConfig} from '@conciv/protocol/harness-types'
import type {AttachmentDocumentPart} from '@conciv/extension'
import type {ChatContentPart} from '@conciv/protocol/chat-types'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import {tokenUsageToSnapshot, type UsageSnapshot} from '@conciv/protocol/usage-types'
import {
  clearImageHistory,
  drafts,
  foldRunMessagesIntoImageHistory,
  markers,
  sessions,
  setRunMessages,
  type ConcivDb,
} from '@conciv/db'
import {FIRST_CHUNK_TIMEOUT_MS} from './run-timing.js'
import type {ChatDeps} from './runtime.js'
import type {LiveRun} from './live-runs.js'
import {ensureRow, nativeIdFor, recordNativeId, rowById} from './session-rows.js'
import {sessionSnapshot} from './transcript.js'
import {makeAskGate, makeRunGate, withConcivGate, withConcivSandbox, type PermissionGate} from './gate.js'
import {makeCodeMode} from './code-mode.js'
import {codeModeToolChunks} from './code-mode-parts.js'
import {makeToolNameNormalizer, normalizeChunkToolName} from './tool-names.js'
import {harnessDebug, logError} from '../lib/debug.js'

export type TurnKind = 'chat' | 'compact'

export function resumableToken(
  harness: HarnessAdapter,
  cwd: string,
  token: string | null,
  home?: string,
): string | null {
  if (!token) return null
  const history = harness.history
  if (!history) return token
  if (history.withinProject && !history.withinProject(cwd, token, home)) return null
  const transcriptPath = history.transcriptPath
  if (!transcriptPath) return token
  return existsSync(transcriptPath(cwd, token, home)) ? token : null
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

export type UserContent = string | ChatContentPart[]

type RunRequest = {
  runId: string
  kind: TurnKind
  content: UserContent
}

function userParts(content: UserContent): ContentPart[] {
  if (typeof content === 'string') return [{type: 'text', content}]
  return content.map((part): ContentPart => {
    if (part.type === 'text') return {type: 'text', content: part.content, metadata: part.metadata}
    if (part.type === 'image') return {type: 'image', source: part.source, metadata: part.metadata}
    return {type: 'document', source: part.source, metadata: part.metadata}
  })
}

function userModelMessage(content: UserContent): ModelMessage {
  return {role: 'user', content: userParts(content)}
}

function compactContent(deps: ChatDeps): UserContent {
  return deps.harness.capabilities.compaction ? '/compact' : COMPACT_FALLBACK_PROMPT
}

function codeModeExtras(
  deps: ChatDeps,
  sessionId: string,
  model: string | null,
  askGate: PermissionGate,
): {systemPrompts: string[]; tools: AnyTool[]} {
  const codeMode = makeCodeMode(() => deps.codeModeCapabilities(sessionId), {sessionId, model}, askGate)
  const systemPrompts = [deps.systemText, codeMode?.systemPrompt].filter((text): text is string => Boolean(text))
  return {systemPrompts, tools: [...deps.tools(sessionId), ...(codeMode?.tools ?? [])]}
}

async function turnMessages(
  deps: ChatDeps,
  sessionId: string,
  options: {resumable: boolean; content: UserContent; prepare: HarnessChatConfig['prepareMessages']},
): Promise<Array<UIMessage | ModelMessage>> {
  const history = options.resumable ? [] : await sessionSnapshot(deps, sessionId)
  const turn = [userModelMessage(options.content)]
  return [...history, ...(options.prepare?.(turn) ?? turn)]
}

async function buildRunStream(
  deps: ChatDeps,
  sessionId: string,
  req: RunRequest,
  gates: {gate: PermissionGate; askGate: PermissionGate},
  abort: AbortController,
): Promise<AsyncIterable<StreamChunk>> {
  const gate = gates.gate
  const model = (await rowById(deps.db, sessionId))?.model ?? null
  const resumeSessionId = deps.harness.capabilities.resume
    ? resumableToken(deps.harness, deps.cwd, await nativeIdFor(deps.db, sessionId), deps.claudeHome)
    : null
  const extras = codeModeExtras(deps, sessionId, model, gates.askGate)
  const config = deps.harness.chatConfig({
    cwd: deps.cwd,
    sessionId,
    resumeSessionId,
    model: model ?? undefined,
    env: deps.harnessEnv?.(sessionId) ?? process.env,
    kind: req.kind,
    hasTools: extras.tools.length > 0,
    decide: (toolName, input, toolUseId) => gate.decide(toolName, input, sessionId, toolUseId),
  })
  const messages = await turnMessages(deps, sessionId, {
    resumable: resumeSessionId !== null,
    content: req.content,
    prepare: config.prepareMessages,
  })
  return chat({
    adapter: config.adapter,
    messages,
    systemPrompts: extras.systemPrompts,
    threadId: sessionId,
    runId: req.runId,
    tools: extras.tools,
    lazyToolsConfig: {includeDescription: 'first-sentence'},
    modelOptions: config.modelOptions,
    middleware: [withConcivSandbox(deps.sandbox), withConcivGate(gate, sessionId)],
    abortController: abort,
    debug: harnessDebug,
  })
}

function stampRunId(chunk: StreamChunk, runId: string): StreamChunk {
  if (
    chunk.type !== EventType.RUN_STARTED &&
    chunk.type !== EventType.RUN_FINISHED &&
    chunk.type !== EventType.RUN_ERROR
  ) {
    return chunk
  }
  if ('runId' in chunk && chunk.runId === runId) return chunk
  return {...chunk, runId}
}

export function mintedSessionId(chunk: StreamChunk): string | null {
  if (chunk.type !== EventType.CUSTOM || !chunk.name.endsWith('.session-id')) return null
  const value = chunk.value
  if (typeof value !== 'object' || value === null || !('sessionId' in value)) return null
  return typeof value.sessionId === 'string' ? value.sessionId : null
}

type RunOutcome = {
  error: string | null
  usage: UsageSnapshot | null
  runEnd: StreamChunk | null
}

function isRunEndChunk(chunk: StreamChunk): boolean {
  if (chunk.type === EventType.RUN_ERROR) return true
  return chunk.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls'
}

function noteToolCall(deps: ChatDeps, sessionId: string, chunk: StreamChunk): void {
  if (chunk.type !== EventType.TOOL_CALL_START) return
  const name = chunk.toolCallName ?? chunk.toolName
  if (typeof name !== 'string') return
  deps.asks.noteToolCall(sessionId, chunk.toolCallId, name)
}

function noteUsage(deps: ChatDeps, model: string | null, chunk: StreamChunk, outcome: RunOutcome): void {
  if (chunk.type !== EventType.RUN_FINISHED || chunk.finishReason === 'tool_calls' || !chunk.usage) return
  outcome.usage = usageSnapshotFor(deps, model ?? deps.harness.defaultModel ?? null, chunk.usage)
}

type ChunkFold = {deps: ChatDeps; sessionId: string; model: string | null; processor: StreamProcessor}

function foldChunk(fold: ChunkFold, chunk: StreamChunk, outcome: RunOutcome): 'continue' | 'stop' {
  const {deps, sessionId} = fold
  fold.processor.processChunk(chunk)
  if (isRunEndChunk(chunk)) outcome.runEnd = chunk
  noteToolCall(deps, sessionId, chunk)
  const minted = mintedSessionId(chunk)
  if (minted) void recordNativeId(deps.db, sessionId, minted).catch(() => {})
  if (chunk.type === EventType.RUN_ERROR) {
    outcome.error = chunk.message || 'run failed'
    return 'stop'
  }
  noteUsage(deps, fold.model, chunk, outcome)
  return 'continue'
}

async function* foldRunStream(
  deps: ChatDeps,
  sessionId: string,
  req: RunRequest,
  processor: StreamProcessor,
  stream: AsyncIterable<StreamChunk>,
  outcome: RunOutcome,
): AsyncGenerator<StreamChunk> {
  const model = (await rowById(deps.db, sessionId))?.model ?? null
  const normalize = makeToolNameNormalizer(deps.toolNames)
  const fold: ChunkFold = {deps, sessionId, model, processor}
  for await (const raw of stream) {
    for (const chunk of codeModeToolChunks(raw) ?? [raw]) {
      const stamped = normalizeChunkToolName(stampRunId(chunk, req.runId), normalize)
      const step = foldChunk(fold, stamped, outcome)
      if (!isRunEndChunk(stamped)) yield stamped
      if (step === 'stop') return
    }
  }
}

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

async function recordRunEnd(deps: ChatDeps, sessionId: string, usage: UsageSnapshot | null): Promise<void> {
  if (!(await rowById(deps.db, sessionId))) return
  await deps.db
    .update(sessions)
    .set({...(usage ? {usage} : {}), updatedAt: Date.now()})
    .where(eq(sessions.id, sessionId))
}

function persistRunOutcome(deps: ChatDeps, sessionId: string, kind: TurnKind): void {
  if (kind === 'chat') {
    foldRunMessagesIntoImageHistory(deps.db, sessionId)
    return
  }
  clearImageHistory(deps.db, sessionId)
}

function runEndChunkFor(sessionId: string, req: RunRequest, outcome: RunOutcome): StreamChunk {
  if (outcome.runEnd) return outcome.runEnd
  if (outcome.error !== null) {
    return {type: EventType.RUN_ERROR, threadId: sessionId, runId: req.runId, message: outcome.error}
  }
  return {type: EventType.RUN_FINISHED, threadId: sessionId, runId: req.runId, finishReason: 'stop'}
}

async function finishRun(deps: ChatDeps, sessionId: string, req: RunRequest, outcome: RunOutcome): Promise<void> {
  persistRunOutcome(deps, sessionId, req.kind)
  deps.snapshots.clear(sessionId)
  if (outcome.usage) outcome.usage.contextTokens = await contextOccupancyFor(deps, sessionId).catch(() => undefined)
  await recordRunEnd(deps, sessionId, outcome.usage).catch(() => {})
  deps.liveRuns.settle(sessionId, req.runId)
  deps.asks.cancel(sessionId)
  if (deps.onRunEnd) await deps.onRunEnd(sessionId).catch(() => {})
}

async function* runStream(
  deps: ChatDeps,
  sessionId: string,
  req: RunRequest,
  abort: AbortController,
): AsyncGenerator<StreamChunk> {
  yield {type: EventType.CUSTOM, name: RUN_ACCEPTED_EVENT, value: {}, timestamp: Date.now()}
  const runLog = deps.durability(req.runId)
  const processor = new StreamProcessor({
    events: {onMessagesChange: (messages) => setRunMessages(deps.db, sessionId, messages)},
  })
  processor.addUserMessage(userParts(req.content))
  const gateDeps = {
    sessionId,
    asks: deps.asks,
    emit: (chunk: StreamChunk) => void runLog.append([chunk]).catch(() => {}),
  }
  const gate = makeRunGate({...gateDeps, risky: deps.risky})
  const askGate = makeAskGate(gateDeps)
  const outcome: RunOutcome = {error: null, usage: null, runEnd: null}
  try {
    deps.stream.publish(sessionId, aguiSnapshotFor(await sessionSnapshot(deps, sessionId)))
    const stream = await buildRunStream(deps, sessionId, req, {gate, askGate}, abort)
    const timeoutMs = deps.firstChunkTimeoutMs ?? FIRST_CHUNK_TIMEOUT_MS
    const bounded = boundFirstChunk(stream, timeoutMs, () => {
      outcome.error = `${deps.harness.id} produced no output within ${Math.round(timeoutMs / 1000)}s`
      abort.abort()
    })
    yield* foldRunStream(deps, sessionId, req, processor, bounded, outcome)
  } catch (error) {
    if (!abort.signal.aborted) outcome.error = error instanceof Error ? error.message : String(error)
  }
  await finishRun(deps, sessionId, req, outcome)
  yield runEndChunkFor(sessionId, req, outcome)
}

function launchRun(deps: ChatDeps, sessionId: string, req: RunRequest): LiveRun {
  const abort = new AbortController()
  const handle = deps.runControl.start({
    runId: req.runId,
    threadId: sessionId,
    stream: runStream(deps, sessionId, req, abort),
  })
  const run: LiveRun = {
    runId: req.runId,
    abort,
    done: handle.done.then(
      () => undefined,
      () => undefined,
    ),
  }
  deps.liveRuns.start(sessionId, run)
  return run
}

function contextWindowFor(harness: HarnessAdapter, modelId: string | null): number | undefined {
  const models = harness.models
  if (!Array.isArray(models) || !modelId) return undefined
  return models.find((model) => model.id === modelId)?.contextWindow
}

async function contextOccupancyFor(deps: ChatDeps, sessionId: string): Promise<number | undefined> {
  const history = deps.harness.history
  if (!history?.contextTokens || !history.transcriptPath) return undefined
  const nativeId = await nativeIdFor(deps.db, sessionId)
  if (!nativeId) return undefined
  if (history.withinProject && !history.withinProject(deps.cwd, nativeId, deps.claudeHome)) return undefined
  const path = history.transcriptPath(deps.cwd, nativeId, deps.claudeHome)
  if (!existsSync(path)) return undefined
  return history.contextTokens(readFileSync(path, 'utf8'))
}

function usageSnapshotFor(deps: ChatDeps, modelId: string | null, usage: TokenUsage): UsageSnapshot {
  const contextWindow = contextWindowFor(deps.harness, modelId)
  return {
    ...tokenUsageToSnapshot(usage),
    ...(modelId ? {modelId} : {}),
    ...(contextWindow ? {contextWindow} : {}),
  }
}

export type AttachmentExpanders = Record<string, (part: AttachmentDocumentPart) => Promise<readonly ContentPart[]>>

const EXPAND_FAILURE_PART: ChatContentPart = {
  type: 'text',
  content: '[attachment could not be processed]',
  metadata: {modelOnly: true},
}

function asExpandable(part: ChatContentPart): AttachmentDocumentPart | null {
  if (part.type !== 'document' || part.source.type !== 'data') return null
  return {type: 'document', source: {type: 'data', mimeType: part.source.mimeType, value: part.source.value}}
}

function markModelOnly(parts: readonly ContentPart[]): ChatContentPart[] {
  return parts.flatMap((part): ChatContentPart[] => {
    if (part.type === 'text') return [{type: 'text', content: part.content, metadata: {modelOnly: true}}]
    if (part.type === 'image' && part.source.type === 'data' && part.source.mimeType !== undefined)
      return [
        {
          type: 'image',
          source: {type: 'data', mimeType: part.source.mimeType, value: part.source.value},
          metadata: {modelOnly: true},
        },
      ]
    return []
  })
}

export async function expandUserParts(content: UserContent, expanders: AttachmentExpanders): Promise<UserContent> {
  if (typeof content === 'string') return content
  const expanded: ChatContentPart[] = []
  for (const part of content) {
    expanded.push(part)
    const expandable = asExpandable(part)
    const expander = expandable ? expanders[expandable.source.mimeType] : undefined
    if (!expandable || !expander) continue
    const produced = await expander(expandable)
      .then(markModelOnly)
      .catch((error: unknown) => {
        logError(`[core] attachment expand failed (${expandable.source.mimeType}): ${String(error)}`)
        return [EXPAND_FAILURE_PART]
      })
    expanded.push(...produced)
  }
  return expanded
}

async function composeUserContent(db: ConcivDb, sessionId: string, content: UserContent): Promise<UserContent> {
  const rows = await db.select({grabs: drafts.grabs}).from(drafts).where(eq(drafts.sessionId, sessionId))
  const grabs = rows[0]?.grabs ?? []
  if (grabs.length === 0) return content
  const prefix = grabs.join('\n')
  if (typeof content === 'string') return content ? `${prefix}\n${content}` : prefix
  return [{type: 'text', content: `${prefix}\n`}, ...content]
}

export type Send = (sessionId: string, runId: string, content: UserContent) => Promise<string>

const RUN_ID_TAKEN_ERROR_NAME = 'RunIdTakenError'

function runIdTakenError(runId: string): Error {
  const error = new Error(`run ${runId} already exists; a runId cannot be reused`)
  error.name = RUN_ID_TAKEN_ERROR_NAME
  return error
}

export function isRunIdTakenError(error: unknown): error is Error {
  return error instanceof Error && error.name === RUN_ID_TAKEN_ERROR_NAME
}

async function prepareLaunchContent(deps: ChatDeps, sessionId: string, content: UserContent): Promise<UserContent> {
  deps.onRunStart?.(sessionId)
  await ensureRow(deps.db, sessionId, deps.harness.id, deps.cwd)
  const userContent = await composeUserContent(deps.db, sessionId, content)
  return expandUserParts(userContent, deps.attachmentExpanders)
}

async function failClaimedRun(deps: ChatDeps, runId: string, error: unknown): Promise<never> {
  const message = error instanceof Error ? error.message : String(error)
  await deps.runs.update(runId, {status: 'failed', finishedAt: Date.now(), error: {message}})
  throw error
}

export function makeSend(deps: ChatDeps): Send {
  return async (sessionId, runId, content) => {
    const startedAt = deps.claimStartedAt()
    const record = await deps.runs.createOrResume({runId, threadId: sessionId, startedAt})
    if (record.threadId !== sessionId || record.startedAt !== startedAt) throw runIdTakenError(runId)
    const expanded = await prepareLaunchContent(deps, sessionId, content).catch((error: unknown) =>
      failClaimedRun(deps, runId, error),
    )
    launchRun(deps, sessionId, {runId, kind: 'chat', content: expanded})
    await deps.db.delete(drafts).where(eq(drafts.sessionId, sessionId))
    return runId
  }
}

export type Compactor = {run: (sessionId: string) => Promise<void>}

async function addCompactMarker(db: ConcivDb, sessionId: string, afterTurn: number): Promise<void> {
  await db.insert(markers).values({id: randomUUID(), sessionId, afterTurn, kind: 'compact'})
}

export function makeCompactor(deps: ChatDeps): Compactor {
  async function run(sessionId: string): Promise<void> {
    deps.onRunStart?.(sessionId)
    const history = await sessionSnapshot(deps, sessionId)
    await addCompactMarker(deps.db, sessionId, history.length)
    const live = launchRun(deps, sessionId, {runId: randomUUID(), kind: 'compact', content: compactContent(deps)})
    await live.done
  }

  return {run}
}
