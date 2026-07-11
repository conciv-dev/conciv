import {EventType, type StreamChunk} from '@tanstack/ai'
import {ChatHistorySchema, type ChatHistory} from '@conciv/protocol/chat-types'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import {lastErrorOf, runEpochOf, runMessagesFor, statusOf, type RunStatus} from '@conciv/db'
import type {ChatDeps} from './runtime.js'
import {readFileOrEmpty} from '../fs.js'
import {makeChangeWaiter} from './changes.js'
import {settledMessages, userText} from './history.js'
import {sessionById} from './session.js'

export const SNAPSHOT_MIN_INTERVAL_MS = 50

export async function transcriptMessages(deps: ChatDeps, sessionId: string): Promise<ChatHistory> {
  if (!deps.harness.capabilities.transcriptHistory || !deps.harness.history) return []
  const record = await sessionById(deps.db, sessionId)
  if (!record?.harnessSessionId) return []
  const jsonl = readFileOrEmpty(deps.harness.history.transcriptPath(deps.cwd, record.harnessSessionId, deps.claudeHome))
  return jsonl ? deps.harness.history.parse(jsonl) : []
}

const isLive = (status: RunStatus): boolean => status !== 'idle'

function pendingUserTextOf(run: ChatHistory): string | null {
  const first = run[0]
  if (!first || first.role !== 'user') return null
  return userText(first)
}

async function buildSnapshot(deps: ChatDeps, sessionId: string): Promise<StreamChunk> {
  const transcript = await transcriptMessages(deps, sessionId)
  const row = runMessagesFor(deps.db, sessionId)
  const run = row ? ChatHistorySchema.parse(row.messages) : []
  const settled = settledMessages(transcript, pendingUserTextOf(run))
  return aguiSnapshotFor([...settled, ...run])
}

async function snapshotKey(deps: ChatDeps, sessionId: string): Promise<string> {
  const row = runMessagesFor(deps.db, sessionId)
  const record = await sessionById(deps.db, sessionId)
  return `${row?.updatedAt ?? 0}:${record?.updatedAt ?? 0}:${record?.harnessSessionId ?? ''}`
}

function runStarted(sessionId: string, epoch: number): StreamChunk {
  return {type: EventType.RUN_STARTED, threadId: sessionId, runId: `${sessionId}:${epoch}`}
}

function runFinished(sessionId: string, epoch: number): StreamChunk {
  return {type: EventType.RUN_FINISHED, threadId: sessionId, runId: `${sessionId}:${epoch}`, finishReason: 'stop'}
}

function runErrored(sessionId: string, epoch: number, message: string): StreamChunk {
  return {type: EventType.RUN_ERROR, threadId: sessionId, runId: `${sessionId}:${epoch}`, message}
}

function endOfRun(deps: ChatDeps, sessionId: string, epoch: number): StreamChunk {
  const lastError = lastErrorOf(deps.db, sessionId)
  return lastError === null ? runFinished(sessionId, epoch) : runErrored(sessionId, epoch, lastError)
}

function lifecycleBefore(
  sessionId: string,
  seen: {epoch: number; live: boolean},
  epoch: number,
  live: boolean,
): StreamChunk[] {
  if (epoch > seen.epoch) {
    const closed = seen.live ? [runFinished(sessionId, seen.epoch)] : []
    return [...closed, runStarted(sessionId, epoch)]
  }
  return !seen.live && live ? [runStarted(sessionId, epoch)] : []
}

function lifecycleAfter(
  deps: ChatDeps,
  sessionId: string,
  seen: {epoch: number; live: boolean},
  epoch: number,
  live: boolean,
): StreamChunk[] {
  const wasLive = epoch > seen.epoch ? true : seen.live
  return wasLive && !live ? [endOfRun(deps, sessionId, epoch)] : []
}

export async function* attachLive(deps: ChatDeps, sessionId: string, signal: AbortSignal): AsyncGenerator<StreamChunk> {
  const waiter = makeChangeWaiter(deps.changes, signal)
  try {
    const seen = {
      epoch: runEpochOf(deps.db, sessionId),
      live: isLive(statusOf(deps.db, sessionId)),
      key: await snapshotKey(deps, sessionId),
    }
    yield await buildSnapshot(deps, sessionId)
    if (seen.live) yield runStarted(sessionId, seen.epoch)
    let lastSnapshotAt = Date.now()
    while (!signal.aborted) {
      await waiter.wait()
      if (signal.aborted) return
      const wait = SNAPSHOT_MIN_INTERVAL_MS - (Date.now() - lastSnapshotAt)
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      const epoch = runEpochOf(deps.db, sessionId)
      const live = isLive(statusOf(deps.db, sessionId))
      yield* lifecycleBefore(sessionId, seen, epoch, live)
      const key = await snapshotKey(deps, sessionId)
      if (key !== seen.key) {
        yield await buildSnapshot(deps, sessionId)
        lastSnapshotAt = Date.now()
      }
      yield* lifecycleAfter(deps, sessionId, seen, epoch, live)
      seen.epoch = epoch
      seen.live = live
      seen.key = key
    }
  } finally {
    waiter.dispose()
  }
}
