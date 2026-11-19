import {Clock, Context, Effect, Layer, Option, PubSub, Schedule, Stream, SubscriptionRef, Schema} from 'effect'
import {
  initialCaptureControl,
  isCaptureLive,
  transitionCaptureControl,
  type CaptureControlEffect,
  type CaptureControlEvent,
  type CaptureRange,
} from './capture-control-machine.js'
import {ClientRings} from './rings.js'
import type {RecorderControl} from './rpc.js'

const CAPTURE_TICK = '5 seconds'

export const CaptureNotFound = Schema.TaggedStruct('RecorderCaptureNotFound', {captureId: Schema.String})
export type CaptureNotFound = typeof CaptureNotFound.Type

export type StartedCapture = {readonly captureId: string; readonly startTs: number; readonly appendCursor: number}

export type StoppedCapture = CaptureRange & {readonly appendCursor: number}

export type CaptureControlInterface = {
  readonly controls: Stream.Stream<RecorderControl>
  readonly emit: (control: RecorderControl) => Effect.Effect<number>
  readonly isLive: Effect.Effect<boolean>
  readonly startCapture: Effect.Effect<StartedCapture>
  readonly stopCapture: (captureId: string) => Effect.Effect<StoppedCapture, CaptureNotFound>
  readonly renewViewer: (viewerId: string) => Effect.Effect<void>
  readonly dropViewer: (viewerId: string) => Effect.Effect<void>
  readonly awaitAppendAfter: (appendCursor: number, timeoutMs: number) => Effect.Effect<boolean>
}

export const CaptureControl = Context.Service<CaptureControlInterface>('@conciv/plugin-recorder/CaptureControl')

function readStop(effects: readonly CaptureControlEffect[]): CaptureRange | undefined {
  return effects.flatMap((effect) => (effect.type === 'answer-stop' && effect.range ? [effect.range] : []))[0]
}

function readControls(effects: readonly CaptureControlEffect[]): readonly RecorderControl[] {
  return effects.flatMap((effect) => (effect.type === 'emit' ? [effect.control] : []))
}

export const captureControlLayer = Layer.effect(
  CaptureControl,
  Effect.gen(function* () {
    const rings = yield* ClientRings
    const state = yield* SubscriptionRef.make(initialCaptureControl)
    const controls = yield* PubSub.unbounded<RecorderControl>()
    const appendCursor = SubscriptionRef.get(rings.appendCursor)

    const emit = (control: RecorderControl) =>
      Effect.flatMap(appendCursor, (cursor) => Effect.as(PubSub.publish(controls, control), cursor))

    const dispatch = Effect.fn('recorder.capture.dispatch')(function* (event: (now: number) => CaptureControlEvent) {
      const now = yield* Clock.currentTimeMillis
      const effects = yield* SubscriptionRef.modify(state, (current) => {
        const next = transitionCaptureControl(current, event(now))
        return [next.effects, next.state]
      })
      yield* PubSub.publishAll(controls, readControls(effects))
      return {effects, now}
    })

    const tick = dispatch((now) => ({type: 'clock.ticked', now}))

    yield* tick.pipe(Effect.repeat(Schedule.spaced(CAPTURE_TICK)), Effect.forkScoped)
    yield* Effect.addFinalizer(() => dispatch(() => ({type: 'disposed'})))

    const awaitAppendAfter = (cursor: number, timeoutMs: number) =>
      rings.appendCursor.pipe(
        SubscriptionRef.changes,
        Stream.filter((appended) => appended > cursor),
        Stream.runHead,
        Effect.timeoutOption(timeoutMs),
        Effect.map(Option.isSome),
      )

    return CaptureControl.of({
      controls: Stream.fromPubSub(controls),
      emit,
      isLive: Effect.map(Effect.andThen(tick, SubscriptionRef.get(state)), isCaptureLive),
      startCapture: Effect.gen(function* () {
        const captureId = yield* Effect.sync(() => crypto.randomUUID())
        const cursor = yield* appendCursor
        const {now} = yield* dispatch((at) => ({type: 'capture.started', captureId, now: at}))
        return {captureId, startTs: now, appendCursor: cursor}
      }),
      stopCapture: Effect.fn('recorder.capture.stop')(function* (captureId: string) {
        const cursor = yield* appendCursor
        const {effects} = yield* dispatch((now) => ({type: 'capture.stopped', captureId, now}))
        const range = readStop(effects)
        if (!range) return yield* Effect.fail(CaptureNotFound.make({captureId}))
        return {...range, appendCursor: cursor}
      }),
      renewViewer: (viewerId) => Effect.asVoid(dispatch((now) => ({type: 'viewer.renewed', viewerId, now}))),
      dropViewer: (viewerId) => Effect.asVoid(dispatch((now) => ({type: 'viewer.dropped', viewerId, now}))),
      awaitAppendAfter,
    })
  }),
)
