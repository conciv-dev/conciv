import {EventType, type StreamChunk, type UIMessage} from '@tanstack/ai'
import {makeRunView, type RunView} from './run-view.js'

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
  view: RunView
  userMessage: UIMessage | null
  generating: boolean
  stopped: boolean
  subscribers: Set<Subscriber>
}

export type TurnHub = {
  start: (sessionId: string, userMessage: UIMessage | null, stream: AsyncIterable<StreamChunk>) => Promise<void>
  generating: (sessionId: string) => boolean
  pendingUserMessage: (sessionId: string) => UIMessage | null
  markStopped: (sessionId: string) => void
  attach: (sessionId: string, signal: AbortSignal) => {replay: StreamChunk[]; live: AsyncGenerator<StreamChunk>}
  trackedSessions: () => number
}

export function makeTurnHub(): TurnHub {
  const sessions = new Map<string, SessionRun>()

  function sessionFor(sessionId: string): SessionRun {
    const existing = sessions.get(sessionId)
    if (existing) return existing
    const created: SessionRun = {
      view: makeRunView(),
      userMessage: null,
      generating: false,
      stopped: false,
      subscribers: new Set(),
    }
    sessions.set(sessionId, created)
    return created
  }

  function releaseIfIdle(sessionId: string, session: SessionRun): void {
    if (session.generating) return
    if (session.subscribers.size > 0) return
    if (sessions.get(sessionId) !== session) return
    sessions.delete(sessionId)
  }

  async function start(
    sessionId: string,
    userMessage: UIMessage | null,
    stream: AsyncIterable<StreamChunk>,
  ): Promise<void> {
    const session = sessionFor(sessionId)
    session.view.reset()
    session.userMessage = userMessage
    session.generating = true
    session.stopped = false
    try {
      for await (const chunk of stream) {
        session.view.record(chunk)
        for (const subscriber of session.subscribers) subscriber.push(chunk)
      }
    } catch (error) {
      const message = session.stopped ? 'stopped' : errorMessage(error)
      const runError = {type: EventType.RUN_ERROR, message} as StreamChunk
      for (const subscriber of session.subscribers) subscriber.push(runError)
    } finally {
      session.view.reset()
      session.userMessage = null
      session.generating = false
      session.stopped = false
      releaseIfIdle(sessionId, session)
    }
  }

  function attach(sessionId: string, signal: AbortSignal): {replay: StreamChunk[]; live: AsyncGenerator<StreamChunk>} {
    const session = sessionFor(sessionId)
    const subscriber = makeSubscriber()
    session.subscribers.add(subscriber)
    const detach = () => {
      session.subscribers.delete(subscriber)
      subscriber.close()
      releaseIfIdle(sessionId, session)
    }
    signal.addEventListener('abort', detach, {once: true})
    if (signal.aborted) detach()
    return {replay: session.view.snapshot(), live: subscriber.iterate()}
  }

  function markStopped(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (session?.generating) session.stopped = true
  }

  return {
    start,
    attach,
    markStopped,
    generating: (sessionId) => sessions.get(sessionId)?.generating ?? false,
    pendingUserMessage: (sessionId) => sessions.get(sessionId)?.userMessage ?? null,
    trackedSessions: () => sessions.size,
  }
}
