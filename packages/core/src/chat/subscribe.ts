import {EventType, type StreamChunk} from '@tanstack/ai'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import type {ChatDeps} from './runtime.js'
import {isRunEndChunk} from './run.js'
import {sessionSnapshot} from './transcript.js'

export type SessionStreams = {
  publish: (sessionId: string, chunk: StreamChunk) => void
  listen: (sessionId: string, onChunk: (chunk: StreamChunk) => void) => () => void
  replay: (sessionId: string) => StreamChunk[]
}

export function createSessionStreams(): SessionStreams {
  const bySession = new Map<string, Set<(chunk: StreamChunk) => void>>()
  const activeRunChunks = new Map<string, StreamChunk[]>()
  const record = (sessionId: string, chunk: StreamChunk): void => {
    if (chunk.type === EventType.RUN_STARTED) {
      activeRunChunks.set(sessionId, [chunk])
      return
    }
    if (isRunEndChunk(chunk)) {
      activeRunChunks.delete(sessionId)
      return
    }
    activeRunChunks.get(sessionId)?.push(chunk)
  }
  return {
    publish: (sessionId, chunk) => {
      record(sessionId, chunk)
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
    replay: (sessionId) => [...(activeRunChunks.get(sessionId) ?? [])],
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
  const unlisten = deps.stream.listen(sessionId, queue.push)
  const replayed = deps.stream.replay(sessionId)
  try {
    yield aguiSnapshotFor(await sessionSnapshot(deps, sessionId))
    for (const chunk of replayed) yield chunk
    while (!signal.aborted) {
      const chunk = await queue.take()
      if (chunk === null) return
      yield chunk
    }
  } finally {
    unlisten()
    queue.close()
  }
}
