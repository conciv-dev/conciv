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
  reserved: boolean
  stopped: boolean
  abort: (() => void) | null
  subscribers: Set<Subscriber>
  token: object
}

export type TurnHub = {
  reserve: (sessionId: string) => boolean
  release: (sessionId: string) => void
  start: (
    sessionId: string,
    userMessage: UIMessage | null,
    stream: AsyncIterable<StreamChunk>,
    abort?: () => void,
  ) => Promise<void>
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
      reserved: false,
      stopped: false,
      abort: null,
      subscribers: new Set(),
      token: {},
    }
    sessions.set(sessionId, created)
    return created
  }

  function releaseIfIdle(sessionId: string, session: SessionRun): void {
    if (session.generating || session.reserved) return
    if (session.subscribers.size > 0) return
    if (sessions.get(sessionId) !== session) return
    sessions.delete(sessionId)
  }

  function reserve(sessionId: string): boolean {
    const session = sessionFor(sessionId)
    if (session.generating || session.reserved) return false
    session.reserved = true
    return true
  }

  function release(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (!session) return
    session.reserved = false
    releaseIfIdle(sessionId, session)
  }

  function beginRun(session: SessionRun, userMessage: UIMessage | null, abort?: () => void): object {
    const token = {}
    session.token = token
    session.view.reset()
    session.userMessage = userMessage
    session.generating = true
    session.reserved = false
    session.stopped = false
    session.abort = abort ?? null
    return token
  }

  function settleRun(session: SessionRun, token: object): void {
    if (session.token !== token) return
    session.userMessage = null
    session.generating = false
    session.stopped = false
    session.abort = null
  }

  function relay(session: SessionRun, token: object, chunk: StreamChunk): void {
    session.view.record(chunk)
    const terminal =
      chunk.type === EventType.RUN_ERROR ||
      (chunk.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls')
    if (terminal) settleRun(session, token)
    for (const subscriber of session.subscribers) subscriber.push(chunk)
    if (terminal && session.token === token) session.view.reset()
  }

  function relayFailure(session: SessionRun, token: object, error: unknown): void {
    const message = session.stopped ? 'stopped' : errorMessage(error)
    const runError = {type: EventType.RUN_ERROR, message} as StreamChunk
    session.view.record(runError)
    settleRun(session, token)
    for (const subscriber of session.subscribers) subscriber.push(runError)
  }

  async function start(
    sessionId: string,
    userMessage: UIMessage | null,
    stream: AsyncIterable<StreamChunk>,
    abort?: () => void,
  ): Promise<void> {
    const session = sessionFor(sessionId)
    const token = beginRun(session, userMessage, abort)
    let failed = false
    try {
      for await (const chunk of stream) relay(session, token, chunk)
    } catch (error) {
      failed = true
      relayFailure(session, token, error)
    } finally {
      settleRun(session, token)
      if (!failed && session.token === token) {
        session.view.reset()
        releaseIfIdle(sessionId, session)
      }
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
    if (!session?.generating) return
    session.stopped = true
    session.abort?.()
  }

  return {
    reserve,
    release,
    start,
    attach,
    markStopped,
    generating: (sessionId) => {
      const session = sessions.get(sessionId)
      return (session?.generating ?? false) || (session?.reserved ?? false)
    },
    pendingUserMessage: (sessionId) => sessions.get(sessionId)?.userMessage ?? null,
    trackedSessions: () => sessions.size,
  }
}
