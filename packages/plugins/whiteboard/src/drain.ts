export * as WhiteboardDrain from './drain.js'
import {Effect, FiberMap, Queue, Schedule} from 'effect'
import type {EvlogError} from 'evlog'
import type {PendingRow} from './rows.js'
import {WhiteboardDrainMachine} from './drain-machine.js'
import {makeMachineDriver} from './machine-driver.js'

type PendingWork = {
  readonly claim: (row: PendingRow) => Effect.Effect<boolean, unknown>
  readonly perform: (row: PendingRow) => Effect.Effect<void, unknown>
  readonly remove: (row: PendingRow) => Effect.Effect<void, EvlogError>
}

const REMOVE_MAX_WAIT_MS = 10_000

export const makePendingDrain = Effect.fn('whiteboard.pendingDrain')(function* (
  work: PendingWork,
  options: {removeRetryMs: number},
) {
  const start = WhiteboardDrainMachine.startDrain()
  const inbox = yield* Queue.unbounded<WhiteboardDrainMachine.DrainEvent>()
  const rows = yield* FiberMap.make<string>()
  const retry = Schedule.min([Schedule.exponential(options.removeRetryMs), Schedule.spaced(REMOVE_MAX_WAIT_MS)]).pipe(
    Schedule.jittered,
  )
  const offer = (event: WhiteboardDrainMachine.DrainEvent) => Queue.offer(inbox, event)

  const run = ({type, attempt, row}: WhiteboardDrainMachine.DrainEffect): Effect.Effect<unknown> => {
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
        Effect.tapError((failure) => Effect.logWarning(`removing ${label} failed; retrying`, failure)),
        Effect.retry(retry),
        Effect.andThen(offer({type: 'removed', id: row.id, attempt})),
      ),
    )
  }

  const driver = yield* makeMachineDriver({
    initial: start.state,
    transition: WhiteboardDrainMachine.transitionDrain,
    run: (command: WhiteboardDrainMachine.DrainEffect) => Effect.asVoid(run(command)),
  })

  yield* Queue.take(inbox).pipe(Effect.flatMap(driver.dispatch), Effect.forever, Effect.forkScoped)
  yield* Effect.addFinalizer(() => driver.dispatch({type: 'disposed'}))

  return {state: driver.state, see: (seen: readonly PendingRow[]) => offer({type: 'seen', rows: seen})}
})
