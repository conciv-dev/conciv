import {randomUUID} from 'node:crypto'
import {existsSync, readFileSync} from 'node:fs'
import {eq} from 'drizzle-orm'
import {z} from 'zod'
import {
  chat,
  EventType,
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
import {aguiSnapshotFor, APPROVAL_REQUESTED_EVENT} from '@conciv/protocol/ui-types'
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
  type ConcivDb,
} from '@conciv/db'
import type {ChatDeps} from './runtime.js'
import {ensureRow, nativeIdFor, recordNativeId, rowById} from './session-rows.js'
import {sessionSnapshot} from './transcript.js'
import {makeRunGate, withConcivGate, withConcivSandbox, type PermissionGate} from './gate.js'
import {makeCodeMode} from './code-mode.js'
import {codeModeToolChunks} from './code-mode-parts.js'
import {makeToolNameNormalizer, normalizeChunkToolName} from './tool-names.js'
import {harnessDebug, logError} from '../lib/debug.js'

export const SESSION_BUSY = 'session busy'

export type TurnKind = 'chat' | 'compact'

export type Turn = {abort: AbortController; phase: 'running' | 'awaiting-approval'}

export type TurnRegistry = {
  begin: (sessionId: string) => {turn: Turn; fresh: boolean} | null
  active: (sessionId: string) => Turn | null
  running: (sessionId: string) => boolean
  hold: (sessionId: string) => void
  release: (sessionId: string) => void
}

export function createTurnRegistry(): TurnRegistry {
  const turns = new Map<string, Turn>()
  return {
    begin: (sessionId) => {
      const existing = turns.get(sessionId)
      if (existing?.phase === 'awaiting-approval') {
        existing.phase = 'running'
        return {turn: existing, fresh: false}
      }
      if (existing) return null
      const created: Turn = {abort: new AbortController(), phase: 'running'}
      turns.set(sessionId, created)
      return {turn: created, fresh: true}
    },
    active: (sessionId) => turns.get(sessionId) ?? null,
    running: (sessionId) => turns.get(sessionId)?.phase === 'running',
    hold: (sessionId) => {
      const turn = turns.get(sessionId)
      if (turn) turn.phase = 'awaiting-approval'
    },
    release: (sessionId) => {
      turns.delete(sessionId)
    },
  }
}

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

export type RunRequest = {
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
  gate: PermissionGate,
): {systemPrompts: string[]; tools: AnyTool[]} {
  const codeMode = deps.harness.capabilities.codeMode
    ? makeCodeMode(deps.extensionServerTools(), {sessionId, model}, gate)
    : null
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
  gate: PermissionGate,
  abort: AbortController,
): Promise<AsyncIterable<StreamChunk>> {
  const model = (await rowById(deps.db, sessionId))?.model ?? null
  const resumeSessionId = deps.harness.capabilities.resume
    ? resumableToken(deps.harness, deps.cwd, await nativeIdFor(deps.db, sessionId), deps.claudeHome)
    : null
  const extras = codeModeExtras(deps, sessionId, model, gate)
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

const LIFECYCLE_TYPES = new Set<string>([EventType.RUN_STARTED, EventType.RUN_FINISHED, EventType.RUN_ERROR])

export function stampRunId(chunk: StreamChunk, runId: string): StreamChunk {
  if (!LIFECYCLE_TYPES.has(chunk.type)) return chunk
  if ('runId' in chunk && typeof chunk.runId === 'string' && chunk.runId) return chunk
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
  libraryApprovals: Set<string>
  runEnd: StreamChunk | null
}

export function isRunEndChunk(chunk: StreamChunk): boolean {
  if (chunk.type === EventType.RUN_ERROR) return true
  return chunk.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls'
}

const ApprovalValueSchema = z.object({approval: z.object({id: z.string()}).loose()}).loose()

function approvalIdOf(chunk: StreamChunk): string | null {
  if (chunk.type !== EventType.CUSTOM || chunk.name !== APPROVAL_REQUESTED_EVENT) return null
  const parsed = ApprovalValueSchema.safeParse(chunk.value)
  return parsed.success ? parsed.data.approval.id : null
}

function noteApprovalRequest(deps: ChatDeps, sessionId: string, chunk: StreamChunk, outcome: RunOutcome): void {
  const approvalId = approvalIdOf(chunk)
  if (approvalId === null || deps.asks.opened(sessionId, approvalId)) return
  outcome.libraryApprovals.add(approvalId)
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
  const ended = isRunEndChunk(chunk)
  if (ended) outcome.runEnd = chunk
  if (!ended) deps.stream.publish(sessionId, chunk)
  noteToolCall(deps, sessionId, chunk)
  noteApprovalRequest(deps, sessionId, chunk, outcome)
  const minted = mintedSessionId(chunk)
  if (minted) void recordNativeId(deps.db, sessionId, minted).catch(() => {})
  if (chunk.type === EventType.RUN_ERROR) {
    outcome.error = chunk.message || 'run failed'
    return 'stop'
  }
  noteUsage(deps, fold.model, chunk, outcome)
  return 'continue'
}

async function foldRunStream(
  deps: ChatDeps,
  sessionId: string,
  req: RunRequest,
  processor: StreamProcessor,
  stream: AsyncIterable<StreamChunk>,
  outcome: RunOutcome,
): Promise<void> {
  const model = (await rowById(deps.db, sessionId))?.model ?? null
  const normalize = makeToolNameNormalizer(deps.toolNames)
  const fold: ChunkFold = {deps, sessionId, model, processor}
  for await (const raw of stream) {
    for (const chunk of codeModeToolChunks(raw) ?? [raw]) {
      const stamped = normalizeChunkToolName(stampRunId(chunk, req.runId), normalize)
      if (foldChunk(fold, stamped, outcome) === 'stop') return
    }
  }
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
  if (outcome.libraryApprovals.size > 0 && outcome.error === null) {
    deps.turns.hold(sessionId)
    deps.stream.publish(sessionId, runEndChunkFor(sessionId, req, outcome))
    return
  }
  releaseRun(deps.db, sessionId, outcome.error)
  deps.turns.release(sessionId)
  deps.asks.cancel(sessionId)
  if (deps.onRunEnd) await deps.onRunEnd(sessionId).catch(() => {})
  deps.stream.publish(sessionId, runEndChunkFor(sessionId, req, outcome))
}

export async function startRun(deps: ChatDeps, sessionId: string, req: RunRequest, turn: Turn): Promise<void> {
  const processor = new StreamProcessor({
    events: {onMessagesChange: (messages) => setRunMessages(deps.db, sessionId, messages)},
  })
  processor.addUserMessage(userParts(req.content))
  const gate = makeRunGate({
    sessionId,
    asks: deps.asks,
    emit: (chunk) => deps.stream.publish(sessionId, chunk),
    risky: deps.risky,
  })
  const outcome: RunOutcome = {error: null, usage: null, libraryApprovals: new Set(), runEnd: null}
  try {
    deps.stream.publish(sessionId, aguiSnapshotFor(await sessionSnapshot(deps, sessionId)))
    const stream = await buildRunStream(deps, sessionId, req, gate, turn.abort)
    const timeoutMs = deps.firstChunkTimeoutMs ?? FIRST_CHUNK_TIMEOUT_MS
    const bounded = boundFirstChunk(stream, timeoutMs, () => {
      outcome.error = `${deps.harness.id} produced no output within ${Math.round(timeoutMs / 1000)}s`
      turn.abort.abort()
    })
    await foldRunStream(deps, sessionId, req, processor, bounded, outcome)
  } catch (error) {
    if (!turn.abort.signal.aborted) outcome.error = error instanceof Error ? error.message : String(error)
  } finally {
    await finishRun(deps, sessionId, req, outcome)
  }
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

function claimTurn(deps: ChatDeps, sessionId: string, kind: TurnKind): Turn {
  const claim = deps.turns.begin(sessionId)
  if (!claim) throw new Error(SESSION_BUSY)
  if (!claim.fresh) return claim.turn
  if (claimRun(deps.db, sessionId, kind) === null) {
    deps.turns.release(sessionId)
    throw new Error(SESSION_BUSY)
  }
  return claim.turn
}

export function makeSend(deps: ChatDeps): Send {
  return async (sessionId, runId, content) => {
    const turn = claimTurn(deps, sessionId, 'chat')
    try {
      deps.onRunStart?.(sessionId)
      await ensureRow(deps.db, sessionId, deps.harness.id, deps.cwd)
      const userContent = await composeUserContent(deps.db, sessionId, content)
      const expanded = await expandUserParts(userContent, deps.attachmentExpanders)
      void deps.runs.track(startRun(deps, sessionId, {runId, kind: 'chat', content: expanded}, turn))
      await deps.db.delete(drafts).where(eq(drafts.sessionId, sessionId))
      return runId
    } catch (error) {
      releaseRun(deps.db, sessionId, null)
      deps.turns.release(sessionId)
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
    const turn = claimTurn(deps, sessionId, 'compact')
    try {
      deps.onRunStart?.(sessionId)
      const history = await sessionSnapshot(deps, sessionId)
      await addCompactMarker(deps.db, sessionId, history.length)
    } catch (error) {
      releaseRun(deps.db, sessionId, null)
      deps.turns.release(sessionId)
      throw error
    }
    await startRun(deps, sessionId, {runId: randomUUID(), kind: 'compact', content: compactContent(deps)}, turn)
  }

  return {run}
}
