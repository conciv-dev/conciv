import {AsyncQueue} from '@tanstack/ai-acp'
import type {StreamChunk} from '@tanstack/ai'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {ChatDeps} from './runtime.js'

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

export async function* sessionEvents(
  deps: ChatDeps,
  sessionId: SessionId,
  signal: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const queue = new AsyncQueue<StreamChunk>()
  const stop = (): void => queue.end()
  signal.addEventListener('abort', stop, {once: true})
  const unlisten = deps.stream.listen(sessionId, (chunk) => queue.push(chunk))
  try {
    for await (const chunk of queue) {
      yield chunk
      if (signal.aborted) return
    }
  } finally {
    signal.removeEventListener('abort', stop)
    unlisten()
    queue.end()
  }
}
