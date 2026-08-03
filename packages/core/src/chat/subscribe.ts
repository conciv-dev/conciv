import type {StreamChunk} from '@tanstack/ai'
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

type ChunkQueue = {
  push: (chunk: StreamChunk) => void
  take: () => Promise<StreamChunk | null>
  close: () => void
}

function createChunkQueue(signal: AbortSignal): ChunkQueue {
  const buffered: StreamChunk[] = []
  const state = {wake: null as (() => void) | null, closed: false}
  const wakeUp = (): void => {
    const wake = state.wake
    state.wake = null
    wake?.()
  }
  const close = (): void => {
    state.closed = true
    wakeUp()
  }
  signal.addEventListener('abort', close, {once: true})
  return {
    push: (chunk) => {
      if (state.closed) return
      buffered.push(chunk)
      wakeUp()
    },
    take: async () => {
      while (buffered.length === 0 && !state.closed) {
        await new Promise<void>((resolve) => {
          state.wake = resolve
        })
      }
      return buffered.shift() ?? null
    },
    close: () => {
      signal.removeEventListener('abort', close)
      close()
    },
  }
}

export async function* subscribeSession(
  deps: ChatDeps,
  sessionId: string,
  signal: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const queue = createChunkQueue(signal)
  async function pumpRun(runId: string): Promise<void> {
    for await (const event of deps.runControl.attach(runId, {signal})) queue.push(event.chunk)
  }
  const tailRun = (runId: string): void => {
    void pumpRun(runId).catch(() => {})
  }
  const unlisten = deps.stream.listen(sessionId, queue.push)
  const unlistenRuns = deps.liveRuns.onStart(sessionId, tailRun)
  for (const run of deps.liveRuns.of(sessionId)) tailRun(run.runId)
  try {
    yield aguiSnapshotFor(await sessionSnapshot(deps, sessionId))
    while (!signal.aborted) {
      const chunk = await queue.take()
      if (chunk === null) return
      yield chunk
    }
  } finally {
    unlisten()
    unlistenRuns()
    queue.close()
  }
}
