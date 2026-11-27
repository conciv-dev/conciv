import {Duration, Effect, FiberHandle, FiberSet, Schedule, Stream, SubscriptionRef, type Scope} from 'effect'
import type {EvlogError} from 'evlog'
import type {RrwebEvent} from './rpc.js'
import {RecorderFlusherMachine} from './flusher-machine.js'
import {makeMachineDriver, type MachineDriver} from './machine-driver.js'

export type Flusher = {
  readonly state: SubscriptionRef.SubscriptionRef<RecorderFlusherMachine.FlusherState>
  readonly push: (event: RrwebEvent) => Effect.Effect<void>
  readonly setLive: (live: boolean) => Effect.Effect<void>
  readonly requestFlush: Effect.Effect<void>
  readonly flushNow: Effect.Effect<void>
}

type FlusherDriver = MachineDriver<RecorderFlusherMachine.FlusherState, RecorderFlusherMachine.FlusherEvent>

const FLUSH_RETRY = Schedule.max([Schedule.exponential('1 second'), Schedule.recurs(3)])

function isSettled(state: RecorderFlusherMachine.FlusherState): boolean {
  return state.status === 'waiting' || state.status === 'disposed'
}

export const makeFlusher = Effect.fn('recorder.flusher')(function* (options: {
  readonly send: (events: readonly RrwebEvent[]) => Effect.Effect<void, EvlogError>
  readonly idle?: Duration.Input
  readonly live?: Duration.Input
}): Effect.fn.Return<Flusher, never, Scope.Scope> {
  const arming = yield* FiberHandle.make()
  const sending = yield* FiberSet.make()
  const cadence = (live: boolean): Duration.Input =>
    live ? (options.live ?? '200 millis') : (options.idle ?? '5 seconds')

  const send = (
    command: Extract<RecorderFlusherMachine.FlusherEffect, {readonly type: 'send'}>,
    driver: FlusherDriver,
  ) =>
    options.send(command.events).pipe(
      Effect.tapError((error) => Effect.logWarning('recorder: a flush failed', error)),
      Effect.retry({
        schedule: FLUSH_RETRY,
        while: () =>
          Effect.map(
            SubscriptionRef.get(driver.state),
            (current) => current.status === 'draining' && current.attempt === command.attempt,
          ),
      }),
      Effect.matchEffect({
        onSuccess: () => driver.dispatch({type: 'chunk.sent', attempt: command.attempt}),
        onFailure: () => driver.dispatch({type: 'chunk.failed', attempt: command.attempt}),
      }),
    )

  const arm = (live: boolean, driver: FlusherDriver) =>
    Effect.asVoid(
      FiberHandle.run(
        arming,
        Effect.andThen(
          Effect.sleep(cadence(live)),
          FiberSet.run(sending, driver.dispatch({type: 'drain.requested'}), {startImmediately: false}),
        ),
      ),
    )

  const driver = yield* makeMachineDriver({
    initial: RecorderFlusherMachine.initialFlusher,
    transition: RecorderFlusherMachine.transitionFlusher,
    run: (command: RecorderFlusherMachine.FlusherEffect, current: FlusherDriver) => {
      if (command.type === 'arm') return arm(command.live, current)
      if (command.type === 'cancel-arm') return FiberHandle.clear(arming)
      if (command.type === 'send')
        return Effect.asVoid(FiberSet.run(sending, send(command, current), {startImmediately: false}))
      return Effect.void
    },
  })

  const awaitSettled = SubscriptionRef.changes(driver.state).pipe(
    Stream.filter(isSettled),
    Stream.runHead,
    Effect.asVoid,
  )

  yield* Effect.addFinalizer(() => Effect.andThen(driver.dispatch({type: 'disposed'}), awaitSettled))
  yield* arm(false, driver)

  return {
    state: driver.state,
    push: (event) => driver.dispatch({type: 'pushed', event}),
    setLive: (live) => driver.dispatch({type: 'live.changed', live}),
    requestFlush: driver.dispatch({type: 'drain.requested'}),
    flushNow: Effect.andThen(driver.dispatch({type: 'drain.requested'}), awaitSettled),
  }
})
