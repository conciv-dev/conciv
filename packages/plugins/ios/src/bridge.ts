import {Effect, FiberHandle, Option, PubSub, Schedule, Schema, Semaphore, Stream, SubscriptionRef} from 'effect'
import {z} from 'zod'
import type {Grab} from '@conciv/grab'
import {NativeToPageSchema, type GrabMode, type PageToNativeMessage} from './rpc.js'
import * as IosBridgeMachine from './bridge-machine.js'

const NATIVE_ROUTE = '/native'

export function nativePageBase(location: {origin: string; pathname: string}): string {
  const index = location.pathname.lastIndexOf(NATIVE_ROUTE)
  const prefix = index >= 0 ? location.pathname.slice(0, index) : ''
  return `${location.origin}${prefix}`
}

export const PickTimedOut = Schema.TaggedStruct('Ios.PickTimedOut', {requestId: Schema.String})
export type PickTimedOut = typeof PickTimedOut.Type

const PickFailed = Schema.TaggedStruct('Ios.PickFailed', {requestId: Schema.String})
type PickFailed = typeof PickFailed.Type

export const PickUnparseable = Schema.TaggedStruct('Ios.PickUnparseable', {requestId: Schema.String})
export type PickUnparseable = typeof PickUnparseable.Type

type PickError = PickTimedOut | PickFailed | PickUnparseable

export type NativeTransport = {
  readonly calls: Stream.Stream<unknown>
  readonly post: (message: PageToNativeMessage) => Effect.Effect<void>
}

export type NativeClient = {
  readonly state: SubscriptionRef.SubscriptionRef<IosBridgeMachine.NativeState>
  readonly signals: Stream.Stream<IosBridgeMachine.NativeSignal>
  readonly pick: (mode: GrabMode) => Effect.Effect<Grab | null, PickError>
  readonly cancel: Effect.Effect<void>
  readonly panelToggled: (toggle: IosBridgeMachine.PanelToggle) => Effect.Effect<void>
}

type Settled = {readonly attempt: number; readonly outcome: IosBridgeMachine.PickOutcome}

const READY_INTERVAL = '300 millis'
const PICK_TIMEOUT = '10 seconds'

const GrabResultCallSchema = z.object({type: z.literal('grabResult'), requestId: z.string()})

function decodeCall(raw: unknown): IosBridgeMachine.NativeEvent {
  const parsed = NativeToPageSchema.safeParse(raw)
  if (parsed.success) return {type: 'native-parsed', message: parsed.data}
  const grabResult = GrabResultCallSchema.safeParse(raw)
  return {type: 'native-unparseable', grabRequestId: grabResult.success ? grabResult.data.requestId : undefined}
}

function settleOutcome(outcome: IosBridgeMachine.PickOutcome): Effect.Effect<Grab | null, PickError> {
  if (outcome.type === 'picked') return Effect.succeed(outcome.grab)
  if (outcome.type === 'cancelled') return Effect.succeed(null)
  if (outcome.failure === 'timed-out') return Effect.fail(PickTimedOut.make({requestId: outcome.requestId}))
  if (outcome.failure === 'unparseable') return Effect.fail(PickUnparseable.make({requestId: outcome.requestId}))
  return Effect.fail(PickFailed.make({requestId: outcome.requestId}))
}

export const makeNativeClient = Effect.fn('Ios.makeNativeClient')(function* (options: {
  readonly transport: NativeTransport
  readonly clientId: string
  readonly apiBase: string
}) {
  const state = yield* SubscriptionRef.make(IosBridgeMachine.createNativeState(options))
  const signals = yield* PubSub.unbounded<IosBridgeMachine.NativeSignal>()
  const signalSubscription = yield* PubSub.subscribe(signals)
  const settlements = yield* PubSub.unbounded<Settled>()
  const ticker = yield* FiberHandle.make<void, never>()
  const pickTimer = yield* FiberHandle.make<void, never>()
  const transitions = yield* Semaphore.make(1)
  const picks = yield* Semaphore.make(1)

  const tickOnce: Effect.Effect<boolean> = Effect.suspend(() => dispatch({type: 'tick'})).pipe(
    Effect.andThen(SubscriptionRef.get(state)),
    Effect.map(IosBridgeMachine.isAnnouncing),
  )

  const perform = (effect: IosBridgeMachine.NativeEffect): Effect.Effect<void> => {
    if (effect.type === 'post') return options.transport.post(effect.message)
    if (effect.type === 'schedule-tick')
      return FiberHandle.run(
        ticker,
        Effect.repeat(tickOnce, {schedule: Schedule.spaced(READY_INTERVAL), while: (announcing) => announcing}).pipe(
          Effect.asVoid,
        ),
      ).pipe(Effect.asVoid)
    if (effect.type === 'schedule-timeout')
      return FiberHandle.run(
        pickTimer,
        Effect.sleep(PICK_TIMEOUT).pipe(Effect.andThen(dispatch({type: 'pick-timeout', attempt: effect.attempt}))),
      ).pipe(Effect.asVoid)
    if (effect.type === 'settle')
      return PubSub.publish(settlements, {attempt: effect.attempt, outcome: effect.outcome}).pipe(Effect.asVoid)
    if (effect.type === 'publish') return PubSub.publish(signals, effect.signal).pipe(Effect.asVoid)
    return Effect.logWarning(effect.message).pipe(Effect.annotateLogs({plugin: 'ios', part: 'bridge'}))
  }

  const dispatch = (event: IosBridgeMachine.NativeEvent): Effect.Effect<void> =>
    transitions.withPermits(1)(
      Effect.gen(function* () {
        const current = yield* SubscriptionRef.get(state)
        const next = IosBridgeMachine.transitionNative(current, event)
        if (next.state !== current) yield* SubscriptionRef.set(state, next.state)
        yield* Effect.forEach(next.effects, perform, {discard: true})
      }),
    )

  const pick = Effect.fn('Ios.nativePick')(function* (mode: GrabMode) {
    const outcome = yield* Effect.scoped(
      Effect.gen(function* () {
        const subscription = yield* PubSub.subscribe(settlements)
        const attempt = yield* picks.withPermits(1)(
          dispatch({type: 'pick-requested', mode}).pipe(
            Effect.andThen(SubscriptionRef.get(state)),
            Effect.map((current) => current.attempts),
          ),
        )
        return yield* Stream.fromSubscription(subscription).pipe(
          Stream.filter((settled) => settled.attempt === attempt),
          Stream.runHead,
        )
      }),
    )
    if (Option.isNone(outcome)) return null
    return yield* settleOutcome(outcome.value.outcome)
  })

  yield* Effect.addFinalizer(() => dispatch({type: 'disposed'}))

  yield* options.transport.calls.pipe(
    Stream.runForEach((raw) => dispatch(decodeCall(raw))),
    Effect.forkScoped,
  )

  yield* dispatch({type: 'started'})

  const client: NativeClient = {
    state,
    signals: Stream.fromSubscription(signalSubscription),
    pick,
    cancel: dispatch({type: 'cancel-requested'}),
    panelToggled: (toggle) => dispatch({type: 'panel-toggled', toggle}),
  }
  return client
})
