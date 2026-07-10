import {existsSync, readFileSync} from 'node:fs'
import {eq} from 'drizzle-orm'
import {chat, EventType, StreamProcessor, type ModelMessage, type StreamChunk, type TokenUsage} from '@tanstack/ai'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {tokenUsageToSnapshot, type UsageSnapshot} from '@conciv/protocol/usage-types'
import {releaseRun, sessions, setRunMessages, statusOf, type ConcivDb} from '@conciv/db'
import type {ChatDeps} from './runtime.js'
import {createSession, sessionById} from './session.js'
import {makeRunGate, withConcivGate, withConcivSandbox} from './sandbox.js'
import {harnessDebug} from '../debug.js'

export type RunRequest = {messages: ModelMessage[]; model: string | null; kind: 'chat' | 'compact'}

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
  if (lastUser && typeof lastUser.content === 'string') processor.addUserMessage(lastUser.content)
  const unwatch = watchForStop(deps, sessionId, abort)
  const outcome: {error: string | null; usage: UsageSnapshot | null} = {error: null, usage: null}
  try {
    const stream = await buildRunStream(deps, sessionId, req, processor, abort)
    for await (const chunk of stream) {
      processor.processChunk(chunk)
      tapSessionId(chunk, (id) => void recordMintedToken(deps.db, sessionId, id).catch(() => {}))
      if (chunk.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls' && chunk.usage) {
        outcome.usage = usageSnapshotFor(deps, req.model ?? deps.harness.defaultModel ?? null, chunk.usage)
      }
    }
  } catch (error) {
    if (!abort.signal.aborted) outcome.error = error instanceof Error ? error.message : String(error)
  } finally {
    unwatch()
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
