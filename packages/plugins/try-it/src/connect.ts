import {Effect, FiberHandle, Schedule, Semaphore, SubscriptionRef} from 'effect'
import {tryItErrors} from './errors/errors.js'
import {TryItConnectMachine} from './connect-machine.js'
import {TryItProbe} from './probe.js'

type ConnectTimings = {readonly probeMs: number; readonly holdMs: number; readonly slowMs: number}

type ConnectInput = {readonly timings: ConnectTimings}

const PROBE_BACK_OFF_CAP = 5

function probeBackOff(probeMs: number) {
  return Schedule.min([Schedule.exponential(probeMs), Schedule.spaced(probeMs * PROBE_BACK_OFF_CAP)])
}

type Connection = {
  readonly state: SubscriptionRef.SubscriptionRef<TryItConnectMachine.ConnectState>
  readonly dispatch: (event: TryItConnectMachine.ConnectEvent) => Effect.Effect<void>
}

export const connect = Effect.fn('try-it.connect')(function* (input: ConnectInput) {
  const {probe} = yield* TryItProbe
  const state = yield* SubscriptionRef.make(TryItConnectMachine.initialConnect.state)
  const slowHint = yield* FiberHandle.make()
  const sweeper = yield* FiberHandle.make()
  const hold = yield* FiberHandle.make()
  const transitions = yield* Semaphore.make(1)

  const sweep = Effect.fn('try-it.sweep')(function* (attempt: number, retry: boolean) {
    const spaced = probe.pipe(
      Effect.retry({
        while: (error) => error.code === tryItErrors.PROBE_SILENT.code,
        schedule: probeBackOff(input.timings.probeMs),
      }),
    )
    yield* (retry ? spaced : probe).pipe(
      Effect.matchEffect({
        onFailure: () => dispatch({type: 'silent', attempt}),
        onSuccess: (base) => dispatch({type: 'answered', attempt, base}),
      }),
    )
  })

  const elapse = Effect.fn('try-it.elapse')(function* (ms: number, event: TryItConnectMachine.ConnectEvent) {
    yield* Effect.sleep(ms)
    yield* dispatch(event)
  })

  const deferred = {startImmediately: false}

  const perform = (effect: TryItConnectMachine.ConnectEffect) => {
    if (effect.type === 'sweep') return FiberHandle.run(sweeper, sweep(effect.attempt, effect.retry), deferred)
    if (effect.type === 'startSlow')
      return FiberHandle.run(slowHint, elapse(input.timings.slowMs, {type: 'slowElapsed'}), deferred)
    if (effect.type === 'stopSlow') return FiberHandle.clear(slowHint)
    return FiberHandle.run(hold, elapse(input.timings.holdMs, {type: 'holdElapsed'}), deferred)
  }

  const dispatch: (event: TryItConnectMachine.ConnectEvent) => Effect.Effect<void> = Effect.fn('try-it.dispatch')(
    function* (event) {
      yield* transitions.withPermits(1)(
        SubscriptionRef.modify(state, (current) => {
          const next = TryItConnectMachine.transitionConnect(current, event)
          return [next.effects, next.state]
        }).pipe(Effect.flatMap((effects) => Effect.forEach(effects, perform, {discard: true}))),
      )
    },
  )

  yield* Effect.addFinalizer(() => dispatch({type: 'disposed'}))
  yield* Effect.forEach(TryItConnectMachine.initialConnect.effects, perform, {discard: true})
  const connection: Connection = {state, dispatch}
  return connection
})
