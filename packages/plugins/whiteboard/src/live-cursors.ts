import {Effect, Schedule, Stream, SubscriptionRef} from 'effect'
import type {Context} from '@conciv/frontend-plugin-api'
import {z} from 'zod'
import {Whiteboard} from './rpc.js'
import {cursorEvent, type CursorEvent} from './rows.js'

const CURSOR_EVENT = 'rpc.whiteboard.cursor'
const CURSOR_STALE_MS = 15_000
const AGENT_COLOR = '#8a86e8'
const RESUBSCRIBE = Schedule.spaced('1 second')
const CursorMoved = z.object({type: z.literal(CURSOR_EVENT), data: cursorEvent})

export type LiveCursors = {
  readonly cursors: SubscriptionRef.SubscriptionRef<readonly CursorEvent[]>
  readonly drawAt: (point: {x: number; y: number}) => Effect.Effect<void>
}

const freshCursors = (cursors: readonly CursorEvent[], moved: CursorEvent): readonly CursorEvent[] => [
  ...cursors.filter((cursor) => cursor.peerId !== moved.peerId && moved.lastSeen - cursor.lastSeen < CURSOR_STALE_MS),
  moved,
]

export const makeLiveCursors = (client: Context['client'], room: string) =>
  Effect.gen(function* () {
    const cursors = yield* SubscriptionRef.make<readonly CursorEvent[]>([])
    const whiteboard = client.rpc(Whiteboard)
    const closing = yield* Effect.acquireRelease(
      Effect.sync(() => new AbortController()),
      (controller) => Effect.sync(() => controller.abort()),
    )

    const received = (event: {type: string}) => {
      if (event.type !== CURSOR_EVENT) return Effect.void
      const parsed = CursorMoved.safeParse(event)
      if (!parsed.success)
        return Effect.logWarning('[whiteboard] a cursor event did not match its schema', parsed.error)
      if (parsed.data.data.room !== room) return Effect.void
      return SubscriptionRef.update(cursors, (current) => freshCursors(current, parsed.data.data))
    }

    yield* Stream.suspend(() =>
      Stream.fromAsyncIterable(
        client.event.subscribe({types: [CURSOR_EVENT], signal: closing.signal}),
        (error) => error,
      ),
    ).pipe(
      Stream.runForEach(received),
      Effect.tapError((error) => Effect.logWarning('[whiteboard] the cursor events stopped; following again', error)),
      Effect.retry({schedule: RESUBSCRIBE, while: () => !closing.signal.aborted}),
      Effect.ignore,
      Effect.forkScoped,
    )

    const drawAt = (point: {x: number; y: number}) =>
      Effect.tryPromise(() =>
        whiteboard['cursor.move']({
          room,
          cursor: {
            peerId: `agent:${room}`,
            kind: 'agent',
            name: 'drawing…',
            color: AGENT_COLOR,
            x: point.x,
            y: point.y,
            lastSeen: Date.now(),
          },
        }),
      ).pipe(
        Effect.tapError((error) => Effect.logWarning('[whiteboard] the drawing cursor was not shared', error)),
        Effect.ignore,
      )

    return {cursors, drawAt} satisfies LiveCursors
  })
