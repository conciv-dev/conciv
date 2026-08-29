import {randomUUID} from 'node:crypto'
import {existsSync, readFileSync} from 'node:fs'
import {eq} from 'drizzle-orm'
import {
  chat,
  EventType,
  fromSpecTokenUsage,
  generateMessageId,
  RUN_ACCEPTED_EVENT,
  StreamProcessor,
  type AnyTool,
  type ContentPart,
  type ModelMessage,
  type SpecTokenUsage,
  type StreamChunk,
  type TokenUsage,
  type UIMessage,
} from '@tanstack/ai'
import type {HarnessAdapter, HarnessChatConfig} from '@conciv/protocol/harness-types'
import type {AttachmentDocumentPart} from '@conciv/extension'
import {isHarnessSessionId} from '@conciv/protocol/chat-types'
import type {ChatContentPart, HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import {tokenUsageToSnapshot, type UsageSnapshot} from '@conciv/protocol/usage-types'
import {
  clearSessionHistory,
  drafts,
  foldRichRunMessagesIntoHistory,
  foldRunMessagesIntoHistory,
  markers,
  sessions,
  setRunMessages,
  type ConcivDb,
} from '@conciv/db'
import {transcriptPathWithin} from '@conciv/harness'
import {FIRST_CHUNK_TIMEOUT_MS} from './run-timing.js'
import type {ChatDeps, ToolRunContext} from './runtime.js'
import type {LiveRun} from './live-runs.js'
import {ensureRow, nativeIdFor, recordNativeId, rowById} from './session-rows.js'
import {sessionSnapshot, transcriptTailId} from './transcript.js'
import {settleContextOccupancy} from './occupancy.js'
import {publishRunLifecycle, publishRunRecord} from './run-lifecycle.js'
import {stopSession} from './stop.js'
import {asksFor, commandMemoryFor, makeAskGate, makeRunGate, withConcivGate, type PermissionGate} from './gate.js'
import {withConcivSandbox} from './sandbox.js'
import {makeCodeMode} from './code-mode.js'
import {codeModeToolChunks} from './code-mode-parts.js'
import {makeToolNameNormalizer, normalizeChunkToolName} from './tool-names.js'
import {harnessDebug, logError} from '../lib/debug.js'

export type TurnKind = 'chat' | 'compact'

export function resumableToken(
  harness: HarnessAdapter,
  cwd: string,
  token: HarnessSessionId | null,
  home?: string,
): HarnessSessionId | null {
  if (!token) return null
  const history = harness.history
  if (!history) return token
  if (history.withinProject && !history.withinProject(cwd, token, home)) return null
  if (history.transcriptPath === undefined) return token
  const path = transcriptPathWithin(history, cwd, token, home)
  return path !== null && existsSync(path) ? token : null
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
  messageId?: string
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

type RunIngest = (chunks: StreamChunk[]) => void

function runLogEmitter(
  context: ToolRunContext | undefined,
  ingest: RunIngest,
): (eventName: string, value: Record<string, unknown>) => void {
  return (eventName, value) => {
    const parentId = context?.toolCallId
    const stamped = parentId === undefined ? value : {...value, toolCallId: parentId}
    const chunks = codeModeToolChunks({type: EventType.CUSTOM, name: eventName, value: stamped, timestamp: Date.now()})
    if (chunks === null) {
      context?.emitCustomEvent?.(eventName, value)
      return
    }
    ingest(chunks)
  }
}

function toolsIngestingIntoRunLog(tools: AnyTool[], ingest: RunIngest): AnyTool[] {
  return tools.map((tool) => {
    const execute = tool.execute
    if (!execute) return tool
    return {
      ...tool,
      execute: async (args: unknown, context?: ToolRunContext) =>
        execute(args, {...context, emitCustomEvent: runLogEmitter(context, ingest)}),
    }
  })
}

async function codeModeExtras(
  deps: ChatDeps,
  sessionId: SessionId,
  model: string | null,
  askGate: PermissionGate,
  ingest: RunIngest,
): Promise<{systemPrompts: string[]; tools: AnyTool[]}> {
  const codeMode = await makeCodeMode(
    () => deps.codeModeCapabilities(sessionId),
    sessionId,
    {sessionId, model},
    askGate,
    {listening: (id) => deps.stream.listening(id)},
  )
  const systemPrompts = [deps.systemText, codeMode?.systemPrompt].filter((text): text is string => Boolean(text))
  return {systemPrompts, tools: toolsIngestingIntoRunLog([...(codeMode?.tools ?? [])], ingest)}
}

async function turnMessages(
  deps: ChatDeps,
  sessionId: SessionId,
  options: {resumable: boolean; content: UserContent; prepare: HarnessChatConfig['prepareMessages']},
): Promise<Array<UIMessage | ModelMessage>> {
  const history = options.resumable ? [] : await sessionSnapshot(deps, sessionId)
  const turn = [userModelMessage(options.content)]
  return [...history, ...(options.prepare?.(turn) ?? turn)]
}

async function buildRunStream(
  deps: ChatDeps,
  sessionId: SessionId,
  req: RunRequest,
  gates: {gate: PermissionGate; askGate: PermissionGate},
  ingest: RunIngest,
  abort: AbortController,
): Promise<AsyncIterable<StreamChunk>> {
  const gate = gates.gate
  const model = (await rowById(deps.db, sessionId))?.model ?? null
  const resumeSessionId = deps.harness.capabilities.resume
    ? resumableToken(deps.harness, deps.cwd, await nativeIdFor(deps.db, sessionId), deps.claudeHome)
    : null
  const extras = await codeModeExtras(deps, sessionId, model, gates.askGate, ingest)
  const config = deps.harness.chatConfig({
    cwd: deps.cwd,
    sessionId,
    resumeSessionId,
    model: model ?? undefined,
    env: deps.harnessEnv?.(sessionId) ?? process.env,
    kind: req.kind,
    hasTools: extras.tools.length > 0,
    decide: async (toolName, input, toolUseId) =>
      (await gate.decide(toolName, input, toolUseId)) === 'allow' ? 'allow' : 'deny',
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
    middleware: [withConcivSandbox(deps.sandbox), withConcivGate(gate)],
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

export function mintedSessionId(chunk: StreamChunk): HarnessSessionId | null {
  if (chunk.type !== EventType.CUSTOM || !chunk.name.endsWith('.session-id')) return null
  const value = chunk.value
  if (typeof value !== 'object' || value === null || !('sessionId' in value)) return null
  return isHarnessSessionId(value.sessionId) ? value.sessionId : null
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

function noteToolCall(deps: ChatDeps, sessionId: SessionId, chunk: StreamChunk): void {
  if (chunk.type !== EventType.TOOL_CALL_START) return
  const name = chunk.toolCallName ?? chunk.toolName
  if (typeof name !== 'string') return
  deps.asks.noteToolCall(sessionId, chunk.toolCallId, name)
}

function tokenUsageOf(usage: TokenUsage | SpecTokenUsage[] | undefined): TokenUsage | undefined {
  return Array.isArray(usage) ? fromSpecTokenUsage(usage) : usage
}

function noteUsage(deps: ChatDeps, model: string | null, chunk: StreamChunk, outcome: RunOutcome): void {
  if (chunk.type !== EventType.RUN_FINISHED || chunk.finishReason === 'tool_calls') return
  const usage = tokenUsageOf(chunk.usage)
  if (!usage) return
  outcome.usage = usageSnapshotFor(deps, model ?? deps.harness.defaultModel ?? null, usage)
}

function isTextMessageChunk(chunk: StreamChunk): chunk is Extract<
  StreamChunk,
  {
    type:
      | typeof EventType.TEXT_MESSAGE_START
      | typeof EventType.TEXT_MESSAGE_CONTENT
      | typeof EventType.TEXT_MESSAGE_END
  }
> {
  return (
    chunk.type === EventType.TEXT_MESSAGE_START ||
    chunk.type === EventType.TEXT_MESSAGE_CONTENT ||
    chunk.type === EventType.TEXT_MESSAGE_END
  )
}

function assistantMessageIdStamper(): (chunk: StreamChunk) => StreamChunk {
  let mintedId: string | null = null
  return (chunk: StreamChunk): StreamChunk => {
    if (!isTextMessageChunk(chunk)) return chunk
    if (chunk.messageId !== '') {
      mintedId = chunk.type === EventType.TEXT_MESSAGE_END ? null : chunk.messageId
      return chunk
    }
    const id = mintedId ?? generateMessageId()
    mintedId = chunk.type === EventType.TEXT_MESSAGE_END ? null : id
    return {...chunk, messageId: id}
  }
}

type ChunkFold = {deps: ChatDeps; sessionId: SessionId; model: string | null; processor: StreamProcessor}

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
  fold: ChunkFold,
  normalize: (name: string) => string,
  req: RunRequest,
  stream: AsyncIterable<StreamChunk>,
  outcome: RunOutcome,
): AsyncGenerator<StreamChunk> {
  const stampAssistantId = assistantMessageIdStamper()
  for await (const raw of stream) {
    const stamped = stampAssistantId(normalizeChunkToolName(stampRunId(raw, req.runId), normalize))
    const step = foldChunk(fold, stamped, outcome)
    if (!isRunEndChunk(stamped)) yield stamped
    if (step === 'stop') return
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

async function recordRunEnd(deps: ChatDeps, sessionId: SessionId, usage: UsageSnapshot | null): Promise<void> {
  if (!(await rowById(deps.db, sessionId))) return
  await deps.db
    .update(sessions)
    .set({...(usage ? {usage} : {}), updatedAt: Date.now()})
    .where(eq(sessions.id, sessionId))
}

function persistRunOutcome(deps: ChatDeps, sessionId: SessionId, kind: TurnKind, anchorNativeId: string | null): void {
  if (kind !== 'chat') {
    clearSessionHistory(deps.db, sessionId)
    return
  }
  if (deps.harness.capabilities.transcriptHistory) {
    foldRichRunMessagesIntoHistory(deps.db, sessionId, anchorNativeId)
    return
  }
  foldRunMessagesIntoHistory(deps.db, sessionId, anchorNativeId)
}

function runEndChunkFor(sessionId: SessionId, req: RunRequest, outcome: RunOutcome): StreamChunk {
  if (outcome.runEnd) return outcome.runEnd
  if (outcome.error !== null) {
    return {type: EventType.RUN_ERROR, threadId: sessionId, runId: req.runId, message: outcome.error}
  }
  return {type: EventType.RUN_FINISHED, threadId: sessionId, runId: req.runId, finishReason: 'stop'}
}

async function finishRun(
  deps: ChatDeps,
  sessionId: SessionId,
  req: RunRequest,
  outcome: RunOutcome,
  anchorNativeId: string | null,
): Promise<void> {
  persistRunOutcome(deps, sessionId, req.kind, anchorNativeId)
  await recordRunEnd(deps, sessionId, outcome.usage).catch(() => {})
  deps.liveRuns.settle(sessionId, req.runId)
  deps.asks.cancel(sessionId)
  if (deps.onRunEnd) await deps.onRunEnd(sessionId).catch(() => {})
  if (outcome.usage) void settleContextOccupancy(deps, sessionId).catch(() => {})
}

async function* runStream(
  deps: ChatDeps,
  sessionId: SessionId,
  req: RunRequest,
  abort: AbortController,
): AsyncGenerator<StreamChunk> {
  yield {type: EventType.CUSTOM, name: RUN_ACCEPTED_EVENT, value: {}, timestamp: Date.now()}
  const runLog = deps.durability(req.runId)
  const processor = new StreamProcessor({
    events: {onMessagesChange: (messages) => setRunMessages(deps.db, sessionId, messages)},
  })
  const gateDeps = {
    asks: asksFor(deps.asks, sessionId),
    emit: (chunk: StreamChunk) => void runLog.append([chunk]).catch(() => {}),
  }
  const gate = makeRunGate({
    ...gateDeps,
    risky: deps.risky,
    commandAllows: deps.commandAllows,
    memory: commandMemoryFor(deps.commandMemory, sessionId),
  })
  const askGate = makeAskGate(gateDeps)
  const outcome: RunOutcome = {error: null, usage: null, runEnd: null}
  const anchorNativeId = await transcriptTailId(deps, sessionId).catch(() => null)
  const model = (await rowById(deps.db, sessionId))?.model ?? null
  const normalize = makeToolNameNormalizer(deps.toolNames)
  const fold: ChunkFold = {deps, sessionId, model, processor}
  const ingest: RunIngest = (chunks) => {
    const named = chunks.map((chunk) => normalizeChunkToolName(chunk, normalize))
    for (const chunk of named) foldChunk(fold, chunk, outcome)
    void runLog.append(named).catch(() => {})
  }
  try {
    const stream = await buildRunStream(deps, sessionId, req, {gate, askGate}, ingest, abort)
    processor.addUserMessage(userParts(req.content), req.messageId)
    await runLog.append([aguiSnapshotFor(await sessionSnapshot(deps, sessionId))]).catch(() => {})
    const timeoutMs = deps.firstChunkTimeoutMs ?? FIRST_CHUNK_TIMEOUT_MS
    const bounded = boundFirstChunk(stream, timeoutMs, () => {
      outcome.error = `${deps.harness.id} produced no output within ${Math.round(timeoutMs / 1000)}s`
      abort.abort()
    })
    yield* foldRunStream(fold, normalize, req, bounded, outcome)
  } catch (error) {
    if (!abort.signal.aborted) outcome.error = error instanceof Error ? error.message : String(error)
  }
  await finishRun(deps, sessionId, req, outcome, anchorNativeId)
  yield runEndChunkFor(sessionId, req, outcome)
}

function launchRun(deps: ChatDeps, sessionId: SessionId, req: RunRequest): LiveRun {
  const abort = new AbortController()
  const handle = deps.runControl.start({
    runId: req.runId,
    threadId: sessionId,
    stream: runStream(deps, sessionId, req, abort),
  })
  const settled = handle.done.then(
    () => publishRunRecord(deps, sessionId, req.runId),
    () => publishRunRecord(deps, sessionId, req.runId),
  )
  const run: LiveRun = {runId: req.runId, abort, done: settled.catch(() => undefined)}
  deps.liveRuns.start(sessionId, run)
  return run
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

export type Send = (sessionId: SessionId, runId: string, content: UserContent, messageId?: string) => Promise<string>

const RUN_ID_TAKEN_ERROR_NAME = 'RunIdTakenError'

function runIdTakenError(runId: string): Error {
  const error = new Error(`run ${runId} already exists; a runId cannot be reused`)
  error.name = RUN_ID_TAKEN_ERROR_NAME
  return error
}

export function isRunIdTakenError(error: unknown): error is Error {
  return error instanceof Error && error.name === RUN_ID_TAKEN_ERROR_NAME
}

async function prepareLaunchContent(deps: ChatDeps, sessionId: SessionId, content: UserContent): Promise<UserContent> {
  deps.onRunStart?.(sessionId)
  await ensureRow(deps.db, sessionId, deps.harness.id, deps.cwd)
  return expandUserParts(content, deps.attachmentExpanders)
}

async function settleLiveRuns(deps: ChatDeps, sessionId: SessionId): Promise<void> {
  if (!deps.liveRuns.running(sessionId)) return
  await stopSession(deps, sessionId)
  await Promise.all(deps.liveRuns.of(sessionId).map((run) => run.done))
}

async function failClaimedRun(deps: ChatDeps, runId: string, error: unknown): Promise<never> {
  const message = error instanceof Error ? error.message : String(error)
  await deps.runs.update(runId, {status: 'failed', finishedAt: Date.now(), error: {message}})
  throw error
}

export function makeSend(deps: ChatDeps): Send {
  return (sessionId, runId, content, messageId) =>
    deps.liveRuns.serialize(sessionId, async () => {
      const startedAt = deps.claimStartedAt()
      const record = await deps.runs.createOrResume({runId, threadId: sessionId, startedAt})
      if (record.threadId !== sessionId || record.startedAt !== startedAt) throw runIdTakenError(runId)
      const expanded = await prepareLaunchContent(deps, sessionId, content).catch((error: unknown) =>
        failClaimedRun(deps, runId, error),
      )
      await settleLiveRuns(deps, sessionId)
      launchRun(deps, sessionId, {runId, kind: 'chat', content: expanded, messageId})
      publishRunLifecycle(deps, sessionId, record)
      await deps.db.delete(drafts).where(eq(drafts.sessionId, sessionId))
      return runId
    })
}

export type Compactor = {run: (sessionId: SessionId) => Promise<void>}

async function addCompactMarker(db: ConcivDb, sessionId: SessionId, afterTurn: number): Promise<void> {
  await db.insert(markers).values({id: randomUUID(), sessionId, afterTurn, kind: 'compact'})
}

export function makeCompactor(deps: ChatDeps): Compactor {
  function run(sessionId: SessionId): Promise<void> {
    return deps.liveRuns.serialize(sessionId, async () => {
      deps.onRunStart?.(sessionId)
      await settleLiveRuns(deps, sessionId)
      const history = await sessionSnapshot(deps, sessionId)
      await addCompactMarker(deps.db, sessionId, history.length)
      const live = launchRun(deps, sessionId, {runId: randomUUID(), kind: 'compact', content: compactContent(deps)})
      await live.done
    })
  }

  return {run}
}
