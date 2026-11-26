import {Clock, Duration, Effect, Queue, Stream} from 'effect'
import type {Context} from '@conciv/backend-plugin-api/effect/plugin'
import type {Store} from './store.js'
import type {CursorEvent} from './rows.js'

const AGENT_COLOR = '#19c3b2'
const PEER_IDLE = Duration.minutes(1)

type SessionId = Parameters<Context['session']['get']>[0]['sessionId']

export type AgentCursor = (sessionId: SessionId, spot: {x: number; y: number}) => Effect.Effect<void>

const sessionModel = (session: Context['session'], sessionId: SessionId) =>
  Effect.suspend(() => session.get({sessionId})).pipe(
    Effect.map((info) => info.model?.id ?? null),
    Effect.orElseSucceed(() => null),
  )

export const makeAgentCursor = Effect.fn('WhiteboardAgentCursor.make')(function* (
  session: Context['session'],
  store: Store,
  throttleMs: number,
) {
  const moves = yield* Queue.unbounded<CursorEvent>()
  yield* Stream.fromQueue(moves).pipe(
    Stream.groupByKey((cursor) => `${cursor.room}:${cursor.peerId}`, {idleTimeToLive: PEER_IDLE}),
    Stream.flatMap(
      ([, perPeer]) =>
        perPeer.pipe(
          Stream.rechunk(1),
          Stream.buffer({capacity: 1, strategy: 'sliding'}),
          Stream.throttle({
            cost: (chunk) => chunk.length,
            units: 1,
            duration: Duration.millis(throttleMs),
            strategy: 'shape',
          }),
        ),
      {concurrency: 'unbounded'},
    ),
    Stream.runForEach(store.cursor),
    Effect.forkScoped({startImmediately: true}),
  )
  const moveAgentCursor: AgentCursor = (sessionId, {x, y}) =>
    Effect.gen(function* () {
      const model = yield* sessionModel(session, sessionId)
      const lastSeen = yield* Clock.currentTimeMillis
      yield* Queue.offer(moves, {
        room: sessionId,
        peerId: `agent:${model ?? 'ai'}`,
        kind: 'agent',
        name: model ?? 'AI',
        color: AGENT_COLOR,
        x,
        y,
        lastSeen,
      })
    })
  return moveAgentCursor
})
