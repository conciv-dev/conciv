import {Clock, Deferred, Effect, Option, Stream} from 'effect'
import type {Store, StoreError, WhiteboardEvent} from './store.js'
import * as WhiteboardPendingMachine from './pending-machine.js'

export const pendingDrained =
  (room: string, id: string) =>
  (event: WhiteboardEvent): boolean =>
    event.table === 'canvasPending' && event.type === 'delete' && event.room === room && event.key === id

const readClaim = (store: Store, room: string, id: string) =>
  store.pending.claimedUntil(room, id).pipe(
    Effect.map((claim): WhiteboardPendingMachine.PendingClaim =>
      Option.match(claim, {
        onNone: () => ({status: 'gone'}),
        onSome: (until) => (until === null ? {status: 'unclaimed'} : {status: 'claimed', until}),
      }),
    ),
  )

const drivePending = (
  transition: WhiteboardPendingMachine.PendingTransition,
  drained: Deferred.Deferred<void>,
  readPendingClaim: Effect.Effect<WhiteboardPendingMachine.PendingClaim, StoreError>,
): Effect.Effect<WhiteboardPendingMachine.PendingOutcome, StoreError> => {
  const [effect] = transition.effects
  if (effect === undefined) return Effect.die(new Error(`the pending machine stopped in ${transition.state.status}`))
  if (effect.type === 'finish') return Effect.succeed(effect.outcome)
  return Deferred.await(drained).pipe(
    Effect.as({type: 'drained' as const}),
    Effect.timeoutOrElse({
      duration: effect.ms,
      orElse: () =>
        Effect.all({claim: readPendingClaim, now: Clock.currentTimeMillis}).pipe(
          Effect.map(({claim, now}) => ({type: 'waitExpired' as const, attempt: effect.attempt, claim, now})),
        ),
    }),
    Effect.flatMap((event) =>
      drivePending(WhiteboardPendingMachine.transitionPending(transition.state, event), drained, readPendingClaim),
    ),
  )
}

export const awaitDrawing = Effect.fn('whiteboard.canvas.awaitDrawing')(function* (
  store: Store,
  room: string,
  write: (id: string) => Effect.Effect<unknown, StoreError>,
  drawDeadlineMs: number,
) {
  const id = crypto.randomUUID()
  const changes = yield* store.follow
  const drained = yield* Deferred.make<void>()
  yield* changes.pipe(
    Stream.filter(pendingDrained(room, id)),
    Stream.runHead,
    Effect.flatMap(() => Deferred.succeed(drained, undefined)),
    Effect.forkScoped,
  )
  yield* write(id)
  return {
    id,
    outcome: yield* drivePending(
      WhiteboardPendingMachine.startPending(drawDeadlineMs),
      drained,
      readClaim(store, room, id),
    ),
  }
})
