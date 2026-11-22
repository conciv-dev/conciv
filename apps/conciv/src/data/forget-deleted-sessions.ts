import {observable, type Accessor} from 'solid-js'
import {Cause, Effect, Fiber, Queue, Schema, Stream} from 'effect'
import type {ConcivClient} from '@conciv/plugin'

type EngineEvent = ReturnType<ConcivClient['event']['subscribe']> extends AsyncIterable<infer Event> ? Event : never

type SessionDeletedEvent = Extract<EngineEvent, {type: 'session.deleted'}>

const SessionEventsFailed = Schema.TaggedStruct('SessionEventsFailed', {cause: Schema.Unknown})

type DeletedSessionsInput = {
  readonly client: ConcivClient
  readonly server: Accessor<string>
  readonly forget: (sessionId: string) => void
}

function followServer(server: Accessor<string>): Stream.Stream<string> {
  return Stream.callback<string>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => observable(server).subscribe((apiBase) => Queue.offerUnsafe(queue, apiBase))),
      (watching) => Effect.sync(() => watching.unsubscribe()),
    ),
  )
}

function isSessionDeleted(event: EngineEvent): event is SessionDeletedEvent {
  return event.type === 'session.deleted'
}

const awaitEngineBound = Effect.fn('app.sessions.awaitEngineBound')(function* (server: Accessor<string>) {
  yield* followServer(server).pipe(
    Stream.filter((apiBase) => apiBase !== ''),
    Stream.runHead,
  )
})

const forgetDeletedSession = Effect.fn('app.sessions.forgetDeleted')(function* (
  sessionId: string,
  forget: (sessionId: string) => void,
) {
  yield* Effect.annotateCurrentSpan('sessionId', sessionId)
  yield* Effect.sync(() => forget(sessionId))
})

const subscriptionSignal = Effect.acquireRelease(
  Effect.sync(() => new AbortController()),
  (subscription) => Effect.sync(() => subscription.abort()),
)

const readDeletedSessions = Effect.fn('app.sessions.readDeleted')(
  function* (input: DeletedSessionsInput) {
    yield* awaitEngineBound(input.server)
    const subscription = yield* subscriptionSignal
    yield* Stream.fromAsyncIterable(input.client.event.subscribe({signal: subscription.signal}), (cause) =>
      SessionEventsFailed.make({cause}),
    ).pipe(
      Stream.filter(isSessionDeleted),
      Stream.runForEach((event) => forgetDeletedSession(event.data.sessionID, input.forget)),
    )
  },
  Effect.scoped,
  Effect.catchCauseIf(
    (cause) => !Cause.hasInterruptsOnly(cause),
    (cause) => Effect.logError('[conciv] stopped reading session deletions', cause),
  ),
)

export function forgetDeletedSessions(input: DeletedSessionsInput): () => void {
  const reader = Effect.runFork(readDeletedSessions(input))

  return () => {
    Effect.runFork(Fiber.interrupt(reader))
  }
}
