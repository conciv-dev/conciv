import type {StreamChunk} from '@tanstack/ai'
import {AsyncQueue} from '@tanstack/ai-acp'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import type {ChatDeps} from './runtime.js'
import {sessionSnapshot} from './transcript.js'

export type SessionStreams = {
  publish: (sessionId: string, chunk: StreamChunk) => void
  listen: (sessionId: string, onChunk: (chunk: StreamChunk) => void) => () => void
}

export function createSessionStreams(): SessionStreams {
  const bySession = new Map<string, Set<(chunk: StreamChunk) => void>>()
  return {
    publish: (sessionId, chunk) => {
      for (const listener of bySession.get(sessionId) ?? []) listener(chunk)
    },
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

export async function* subscribeSession(
  deps: ChatDeps,
  sessionId: string,
  signal: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const queue = new AsyncQueue<StreamChunk>()
  const stop = (): void => queue.end()
  signal.addEventListener('abort', stop, {once: true})
  async function pumpRun(runId: string): Promise<void> {
    for await (const event of deps.runControl.attach(runId, {signal})) queue.push(event.chunk)
  }
  const tailRun = (runId: string): void => {
    void pumpRun(runId).catch(() => {})
  }
  const unlisten = deps.stream.listen(sessionId, (chunk) => queue.push(chunk))
  const unlistenRuns = deps.liveRuns.onStart(sessionId, tailRun)
  for (const run of deps.liveRuns.of(sessionId)) tailRun(run.runId)
  try {
    yield aguiSnapshotFor(await sessionSnapshot(deps, sessionId))
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
