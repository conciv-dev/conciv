import {Effect, FiberMap, Queue, Schedule, Schema, SubscriptionRef} from 'effect'
import type {PendingRow} from './rows.js'
import {startDrain, transitionDrain, type DrainEffect, type DrainEvent, type DrainState} from './drain-machine.js'

export const RemoveFailed = Schema.TaggedStruct('RemoveFailed', {message: Schema.String})
type RemoveFailed = typeof RemoveFailed.Type

type PendingWork = {
  readonly claim: (row: PendingRow) => Effect.Effect<boolean, unknown>
  readonly perform: (row: PendingRow) => Effect.Effect<void, unknown>
  readonly remove: (row: PendingRow) => Effect.Effect<void, RemoveFailed>
}

const REMOVE_MAX_WAIT_MS = 10_000

export const makePendingDrain = Effect.fn('whiteboard.pendingDrain')(function* (
  work: PendingWork,
  options: {removeRetryMs: number},
) {
  const start = startDrain()
  const state = yield* SubscriptionRef.make<DrainState>(start.state)
  const inbox = yield* Queue.unbounded<DrainEvent>()
  const rows = yield* FiberMap.make<string>()
  const retry = Schedule.min([Schedule.exponential(options.removeRetryMs), Schedule.spaced(REMOVE_MAX_WAIT_MS)]).pipe(
    Schedule.jittered,
  )
  const offer = (event: DrainEvent) => Queue.offer(inbox, event)

  const run = ({type, attempt, row}: DrainEffect): Effect.Effect<unknown> => {
    const label = `pending ${row.kind} ${row.id}`
    if (type === 'claim')
      return FiberMap.run(
        rows,
        row.id,
        work.claim(row).pipe(
          Effect.catchCause((cause) => Effect.logError(`claiming ${label} failed`, cause).pipe(Effect.as(false))),
          Effect.flatMap((claimed) => offer({type: 'claimed', id: row.id, attempt, claimed})),
        ),
      )
    if (type === 'run')
      return FiberMap.run(
        rows,
        row.id,
        work.perform(row).pipe(
          Effect.catchCause((cause) => Effect.logError(`running ${label} failed`, cause)),
          Effect.andThen(offer({type: 'ran', id: row.id, attempt})),
        ),
      )
    return FiberMap.run(
      rows,
      row.id,
      work.remove(row).pipe(
        Effect.tapError((failure) => Effect.logWarning(`removing ${label} failed; retrying`, failure.message)),
        Effect.retry(retry),
        Effect.andThen(offer({type: 'removed', id: row.id, attempt})),
      ),
    )
  }

  const step = (event: DrainEvent) =>
    SubscriptionRef.modify(state, (current) => {
      const next = transitionDrain(current, event)
      return [next.effects, next.state]
    }).pipe(Effect.flatMap((effects) => Effect.forEach(effects, run, {discard: true})))

  yield* Queue.take(inbox).pipe(Effect.flatMap(step), Effect.forever, Effect.forkScoped)
  yield* Effect.addFinalizer(() => step({type: 'disposed'}))

  return {state, see: (seen: readonly PendingRow[]) => offer({type: 'seen', rows: seen})}
})

export type PendingDrain = Effect.Success<ReturnType<typeof makePendingDrain>>
