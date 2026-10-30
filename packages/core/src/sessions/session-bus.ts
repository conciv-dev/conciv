import type {ChatEvent} from '@conciv/protocol/chat-event-types'
import type {SessionId} from '@conciv/protocol/chat-types'

type Listener = (chunk: ChatEvent) => void

export type SessionBus = {
  publish: (sessionId: SessionId, chunk: ChatEvent) => void
  listen: (sessionId: SessionId, onChunk: Listener) => () => void
  events: (sessionId: SessionId, signal: AbortSignal) => AsyncGenerator<ChatEvent>
}

export function createSessionBus(): SessionBus {
  const listeners = new Map<SessionId, Set<Listener>>()
  const listen = (sessionId: SessionId, onChunk: Listener): (() => void) => {
    const held = listeners.get(sessionId) ?? new Set<Listener>()
    listeners.set(sessionId, held)
    held.add(onChunk)
    return () => {
      held.delete(onChunk)
      if (held.size === 0) listeners.delete(sessionId)
    }
  }
  async function* events(sessionId: SessionId, signal: AbortSignal): AsyncGenerator<ChatEvent> {
    const release = {unlisten: (): void => undefined}
    const stream = new ReadableStream<ChatEvent>({
      start: (controller) => {
        release.unlisten = listen(sessionId, (chunk) => controller.enqueue(chunk))
        signal.addEventListener(
          'abort',
          () => {
            release.unlisten()
            controller.close()
          },
          {once: true},
        )
      },
      cancel: () => release.unlisten(),
    })
    try {
      yield* stream
    } finally {
      release.unlisten()
    }
  }
  return {
    publish: (sessionId, chunk) => {
      for (const listener of listeners.get(sessionId) ?? []) listener(chunk)
    },
    listen,
    events,
  }
}
