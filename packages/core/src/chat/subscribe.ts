import {EventType, StreamProcessor, type StreamChunk, type UIMessage} from '@tanstack/ai'
import {AsyncQueue} from '@tanstack/ai-acp'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import {aguiRunLifecycleFor} from '@conciv/protocol/run-types'
import {latestRunLifecycle} from './run-lifecycle.js'
import type {ChatDeps} from './runtime.js'
import type {SessionId} from '@conciv/protocol/chat-types'

export type SessionStreams = {
  publish: (sessionId: SessionId, chunk: StreamChunk) => void
  listen: (sessionId: SessionId, onChunk: (chunk: StreamChunk) => void) => () => void
  listening: (sessionId: SessionId) => boolean
}

export function createSessionStreams(): SessionStreams {
  const bySession = new Map<string, Set<(chunk: StreamChunk) => void>>()
  return {
    publish: (sessionId, chunk) => {
      for (const listener of bySession.get(sessionId) ?? []) listener(chunk)
    },
    listening: (sessionId) => (bySession.get(sessionId)?.size ?? 0) > 0,
    listen: (sessionId, onChunk) => {
      const listeners = bySession.get(sessionId) ?? new Set()
      bySession.set(sessionId, listeners)
      listeners.add(onChunk)
      return () => {
        listeners.delete(onChunk)
        if (listeners.size === 0) bySession.delete(sessionId)
      }
    },
  }
}

const FROM_START = '-1'

type LogEntry = {offset: string; chunk: StreamChunk}

type ResumedRun = {runId: string; offset: string; messages: UIMessage[] | null; started: StreamChunk[]}

function consolidated(entries: LogEntry[]): UIMessage[] | null {
  const base = entries.findLastIndex((entry) => entry.chunk.type === EventType.MESSAGES_SNAPSHOT)
  if (base === -1) return null
  const processor = new StreamProcessor({})
  for (const entry of entries.slice(base)) processor.processChunk(entry.chunk)
  return processor.getMessages()
}

function runStarts(entries: LogEntry[]): StreamChunk[] {
  return entries.flatMap((entry) => (entry.chunk.type === EventType.RUN_STARTED ? [entry.chunk] : []))
}

async function resumePoint(deps: ChatDeps, runId: string): Promise<ResumedRun> {
  const entries = await deps
    .durability(runId)
    .snapshot()
    .catch((): LogEntry[] => [])
  return {
    runId,
    offset: entries.at(-1)?.offset ?? FROM_START,
    messages: consolidated(entries),
    started: runStarts(entries),
  }
}

function carriesMessages(run: ResumedRun): run is ResumedRun & {messages: UIMessage[]} {
  return run.messages !== null
}

async function catchUpMessages(deps: ChatDeps, sessionId: SessionId, resumed: ResumedRun[]): Promise<UIMessage[]> {
  const live = resumed.filter(carriesMessages).at(-1)
  return live ? live.messages : deps.snapshot(sessionId)
}

export async function* subscribeSession(
  deps: ChatDeps,
  sessionId: SessionId,
  signal: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const queue = new AsyncQueue<StreamChunk>()
  const stop = (): void => queue.end()
  signal.addEventListener('abort', stop, {once: true})
  async function pumpRun(runId: string, from: string): Promise<void> {
    for await (const event of deps.runControl.attach(runId, from, signal)) queue.push(event.chunk)
  }
  const tailRun = (runId: string, from: string): void => {
    void pumpRun(runId, from).catch(() => {})
  }
  const unlisten = deps.stream.listen(sessionId, (chunk) => queue.push(chunk))
  const unlistenRuns = deps.liveRuns.onStart(sessionId, (runId) => tailRun(runId, FROM_START))
  try {
    const resumed = await Promise.all(deps.liveRuns.of(sessionId).map((run) => resumePoint(deps, run.runId)))
    yield aguiSnapshotFor(await catchUpMessages(deps, sessionId, resumed))
    for (const chunk of resumed.flatMap((run) => run.started)) yield chunk
    const lifecycle = await latestRunLifecycle(deps, sessionId)
    if (lifecycle) yield aguiRunLifecycleFor(lifecycle)
    for (const run of resumed) tailRun(run.runId, run.offset)
    for await (const chunk of queue) {
      yield chunk
      if (signal.aborted) return
    }
  } finally {
    signal.removeEventListener('abort', stop)
    unlisten()
    unlistenRuns()
    queue.end()
  }
}
