import {Effect, FiberHandle, FiberSet, Stream, SubscriptionRef, type Scope, Schema} from 'effect'
import type {RecorderControl} from './rpc.js'
import * as RecorderBootMachine from './boot-machine.js'
import {makeMachineDriver} from './machine-driver.js'

export const ConfigReadFailed = Schema.TaggedStruct('RecorderConfigReadFailed', {cause: Schema.Defect()})
export type ConfigReadFailed = typeof ConfigReadFailed.Type

export const StateReadFailed = Schema.TaggedStruct('RecorderStateReadFailed', {cause: Schema.Defect()})
export type StateReadFailed = typeof StateReadFailed.Type

export function runBoot<Prepared, PrepareFailed>(options: {
  readonly connected: Stream.Stream<boolean>
  readonly readLive: Effect.Effect<boolean, StateReadFailed>
  readonly controls: Stream.Stream<RecorderControl>
  readonly selector: Stream.Stream<string | undefined>
  readonly prepare: (selector: string) => Effect.Effect<Prepared, PrepareFailed>
  readonly open: (prepared: Prepared, onFailed: Effect.Effect<void>) => Effect.Effect<void, never, Scope.Scope>
}): Effect.Effect<SubscriptionRef.SubscriptionRef<RecorderBootMachine.BootState>, never, Scope.Scope> {
  return Effect.gen(function* () {
    const reading = yield* FiberHandle.make()
    const preparing = yield* FiberSet.make()
    const session = yield* FiberHandle.make()
    const driver = yield* makeMachineDriver({
      initial: RecorderBootMachine.initialBoot,
      transition: (state: RecorderBootMachine.BootState, event: RecorderBootMachine.BootEvent<Prepared>) =>
        RecorderBootMachine.transitionBoot(state, event),
      run: (command: RecorderBootMachine.BootEffect<Prepared>, current) => {
        if (command.type === 'prepare')
          return Effect.asVoid(
            FiberSet.run(
              preparing,
              options.prepare(command.selector).pipe(
                Effect.matchEffect({
                  onSuccess: (prepared) => current.dispatch({type: 'prepared', attempt: command.attempt, prepared}),
                  onFailure: (error) => current.dispatch({type: 'start.failed', attempt: command.attempt, error}),
                }),
              ),
              {startImmediately: false},
            ),
          )
        if (command.type === 'open-session')
          return Effect.asVoid(
            FiberHandle.run(
              session,
              Effect.scoped(
                Effect.andThen(
                  options.open(command.prepared, current.dispatch({type: 'session.failed', attempt: command.attempt})),
                  Effect.never,
                ),
              ),
            ),
          )
        if (command.type === 'finish-session') return FiberHandle.clear(session)
        return Effect.logError('recorder: the page capture could not start', command.error)
      },
    })
    yield* Effect.addFinalizer(() => driver.dispatch({type: 'disposed'}))

    const readLive = options.readLive.pipe(
      Effect.matchEffect({
        onSuccess: (live) => driver.dispatch({type: 'live.read', live}),
        onFailure: (error) => Effect.logError('recorder: the recorder state could not be read', error.cause),
      }),
    )
    yield* options.connected.pipe(
      Stream.runForEach((connected) =>
        connected ? Effect.asVoid(FiberHandle.run(reading, readLive)) : FiberHandle.clear(reading),
      ),
      Effect.forkScoped,
    )
    yield* options.controls.pipe(
      Stream.runForEach((control) =>
        control.live === undefined ? Effect.void : driver.dispatch({type: 'live.read', live: control.live}),
      ),
      Effect.forkScoped,
    )
    yield* options.selector.pipe(
      Stream.zipLatest(SubscriptionRef.changes(driver.state).pipe(Stream.map((state) => state.live))),
      Stream.map(([selector, live]) => (live ? selector : undefined)),
      Stream.changes,
      Stream.runForEach((selector) =>
        driver.dispatch(selector === undefined ? {type: 'selector.cleared'} : {type: 'selector.set', selector}),
      ),
      Effect.forkScoped,
    )
    return driver.state
  })
}
