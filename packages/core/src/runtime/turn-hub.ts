import {EventType, type StreamChunk} from '@tanstack/ai'
import type {ChatMessage} from '@conciv/protocol/chat-types'

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

type Subscriber = {
  push: (chunk: StreamChunk) => void
  close: () => void
  iterate: () => AsyncGenerator<StreamChunk>
}

function makeSubscriber(): Subscriber {
  const items: StreamChunk[] = []
  const waiters: ((result: IteratorResult<StreamChunk>) => void)[] = []
  const state = {closed: false}

  function push(chunk: StreamChunk): void {
    const waiter = waiters.shift()
    if (waiter) {
      waiter({value: chunk, done: false})
      return
    }
    items.push(chunk)
  }

  function close(): void {
    state.closed = true
    const waiter = waiters.shift()
    if (waiter) waiter({value: undefined, done: true})
  }

  async function* iterate(): AsyncGenerator<StreamChunk> {
    while (true) {
      const buffered = items.shift()
      if (buffered !== undefined) {
        yield buffered
        continue
      }
      if (state.closed) return
      const next = await new Promise<IteratorResult<StreamChunk>>((resolve) => waiters.push(resolve))
      if (next.done) return
      yield next.value
    }
  }

  return {push, close, iterate}
}

type SessionRun = {
  buffer: StreamChunk[]
  userMessage: ChatMessage | null
  generating: boolean
  subscribers: Set<Subscriber>
}

export type TurnHub = {
  start: (sessionId: string, userMessage: ChatMessage | null, stream: AsyncIterable<StreamChunk>) => Promise<void>
  generating: (sessionId: string) => boolean
  pendingUserMessage: (sessionId: string) => ChatMessage | null
  attach: (sessionId: string, signal: AbortSignal) => {replay: StreamChunk[]; live: AsyncGenerator<StreamChunk>}
}

export function makeTurnHub(): TurnHub {
  const sessions = new Map<string, SessionRun>()

  function sessionFor(sessionId: string): SessionRun {
    const existing = sessions.get(sessionId)
    if (existing) return existing
    const created: SessionRun = {buffer: [], userMessage: null, generating: false, subscribers: new Set()}
    sessions.set(sessionId, created)
    return created
  }

  async function start(
    sessionId: string,
    userMessage: ChatMessage | null,
    stream: AsyncIterable<StreamChunk>,
  ): Promise<void> {
    const session = sessionFor(sessionId)
    session.buffer = []
    session.userMessage = userMessage
    session.generating = true
    try {
      for await (const chunk of stream) {
        session.buffer.push(chunk)
        for (const subscriber of session.subscribers) subscriber.push(chunk)
      }
    } catch (error) {
      const runError = {type: EventType.RUN_ERROR, message: errorMessage(error)} as StreamChunk
      for (const subscriber of session.subscribers) subscriber.push(runError)
    } finally {
      session.buffer = []
      session.userMessage = null
      session.generating = false
    }
  }

  function attach(sessionId: string, signal: AbortSignal): {replay: StreamChunk[]; live: AsyncGenerator<StreamChunk>} {
    const session = sessionFor(sessionId)
    const subscriber = makeSubscriber()
    session.subscribers.add(subscriber)
    const detach = () => {
      session.subscribers.delete(subscriber)
      subscriber.close()
    }
    signal.addEventListener('abort', detach, {once: true})
    if (signal.aborted) detach()
    return {replay: [...session.buffer], live: subscriber.iterate()}
  }

  return {
    start,
    attach,
    generating: (sessionId) => sessions.get(sessionId)?.generating ?? false,
    pendingUserMessage: (sessionId) => sessions.get(sessionId)?.userMessage ?? null,
  }
}
