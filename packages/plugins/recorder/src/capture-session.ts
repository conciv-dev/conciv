import {Effect, FiberHandle, FiberSet, Stream, type Scope, type SubscriptionRef} from 'effect'
import type {EvlogError} from 'evlog'
import type {RecorderConfig, RecorderControl} from './rpc.js'
import {RecorderCaptureSessionMachine} from './capture-session-machine.js'
import type {Flusher} from './flusher.js'
import {makeMachineDriver} from './machine-driver.js'
import {runVisibilityPause} from './visibility-pause.js'

export const openCaptureSession = Effect.fn('recorder.captureSession')(function* (options: {
  readonly config: RecorderConfig
  readonly record: (config: RecorderConfig) => Effect.Effect<void, never, Scope.Scope>
  readonly takeSnapshot: Effect.Effect<void>
  readonly reloadConfig: Effect.Effect<RecorderConfig, EvlogError>
  readonly flusher: Flusher
  readonly controls: Stream.Stream<RecorderControl>
  readonly flushCues: Stream.Stream<unknown>
  readonly hidden: Stream.Stream<boolean>
  readonly onFailed: Effect.Effect<void>
}): Effect.fn.Return<
  SubscriptionRef.SubscriptionRef<RecorderCaptureSessionMachine.CaptureSessionState>,
  never,
  Scope.Scope
> {
  const recording = yield* FiberHandle.make()
  const reading = yield* FiberSet.make()
  const startRecord = (config: RecorderConfig) =>
    Effect.asVoid(FiberHandle.run(recording, Effect.scoped(Effect.andThen(options.record(config), Effect.never))))

  const driver = yield* makeMachineDriver({
    initial: RecorderCaptureSessionMachine.initialCaptureSession,
    transition: RecorderCaptureSessionMachine.transitionCaptureSession,
    run: (command: RecorderCaptureSessionMachine.CaptureSessionEffect, current) => {
      if (command.type === 'stop-record') return FiberHandle.clear(recording)
      if (command.type === 'start-record') return startRecord(command.config)
      if (command.type === 'read-config')
        return Effect.asVoid(
          FiberSet.run(
            reading,
            options.reloadConfig.pipe(
              Effect.matchEffect({
                onSuccess: (config) => current.dispatch({type: 'config.read', attempt: command.attempt, config}),
                onFailure: (error) => current.dispatch({type: 'config.failed', attempt: command.attempt, error}),
              }),
            ),
            {startImmediately: false},
          ),
        )
      if (command.type === 'flush') return options.flusher.requestFlush
      if (command.type === 'report-failed')
        return Effect.andThen(
          Effect.logError('recorder: the page capture could not resume', command.error),
          options.onFailed,
        )
      return Effect.void
    },
  })

  yield* options.flusher.setLive(true)
  yield* startRecord(options.config)
  yield* Effect.addFinalizer(() =>
    Effect.andThen(
      driver.dispatch({type: 'disposed'}),
      Effect.andThen(options.flusher.setLive(false), options.flusher.requestFlush),
    ),
  )
  yield* runVisibilityPause({
    hidden: options.hidden,
    pause: driver.dispatch({type: 'paused'}),
    resume: driver.dispatch({type: 'resumed'}),
  })
  yield* options.flushCues.pipe(
    Stream.runForEach(() => options.flusher.requestFlush),
    Effect.forkScoped,
  )
  yield* options.controls.pipe(
    Stream.runForEach((control) =>
      Effect.andThen(
        control.snapshot ? options.takeSnapshot : Effect.void,
        control.flush ? options.flusher.requestFlush : Effect.void,
      ),
    ),
    Effect.forkScoped,
  )
  return driver.state
})
