import {Effect, FiberHandle, Stream, type Scope, type SubscriptionRef} from 'effect'
import {makeMachineDriver} from './machine-driver.js'
import {RecorderVisibilityPauseMachine} from './visibility-pause-machine.js'

export const runVisibilityPause = Effect.fn('recorder.visibilityPause')(function* (options: {
  readonly hidden: Stream.Stream<boolean>
  readonly pause: Effect.Effect<void>
  readonly resume: Effect.Effect<void>
}): Effect.fn.Return<
  SubscriptionRef.SubscriptionRef<RecorderVisibilityPauseMachine.VisibilityPauseState>,
  never,
  Scope.Scope
> {
  const waiting = yield* FiberHandle.make()
  const driver = yield* makeMachineDriver({
    initial: RecorderVisibilityPauseMachine.initialVisibilityPause,
    transition: RecorderVisibilityPauseMachine.transitionVisibilityPause,
    run: (command: RecorderVisibilityPauseMachine.VisibilityPauseEffect, current) => {
      if (command.type === 'wait')
        return Effect.asVoid(
          FiberHandle.run(
            waiting,
            Effect.andThen(
              Effect.sleep(RecorderVisibilityPauseMachine.HIDDEN_PAUSE_MS),
              current.dispatch({type: 'hide.elapsed', attempt: command.attempt}),
            ),
          ),
        )
      if (command.type === 'cancel-wait') return FiberHandle.clear(waiting)
      if (command.type === 'pause') return options.pause
      return options.resume
    },
  })
  yield* Effect.addFinalizer(() => driver.dispatch({type: 'disposed'}))
  yield* options.hidden.pipe(
    Stream.runForEach((hidden) => driver.dispatch(hidden ? {type: 'hidden'} : {type: 'shown'})),
    Effect.forkScoped,
  )
  return driver.state
})
