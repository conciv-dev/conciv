import {Effect, Stream, type Scope, type SubscriptionRef} from 'effect'
import {z} from 'zod'
import type {Context} from '@conciv/plugin/experimental'
import {Page} from '@conciv/plugin/experimental/page'
import {Recorder, type RecorderControl} from './rpc.js'
import type {RecorderBootMachine} from './boot-machine.js'
import {ConfigReadFailed, StateReadFailed, runBoot} from './boot.js'
import {loadCaptureLibrary, recordPage, takeFreshSnapshot} from './capture.js'
import {ConfigReloadFailed, openCaptureSession} from './capture-session.js'
import {FlushFailed, makeFlusher} from './flusher.js'
import {FOLLOW_AGAIN, FollowFailed, followEvents, followRecording, type ReplaySource} from './player-follow.js'
import {accessorStream, type RecorderRuntime} from './solid-runtime.js'

const FLUSH_CUES: readonly [Window | Document, string][] = [
  [window, 'error'],
  [window, 'unhandledrejection'],
  [window, 'beforeunload'],
  [document, 'visibilitychange'],
]

type PageCapture = {
  readonly boot: SubscriptionRef.SubscriptionRef<RecorderBootMachine.BootState>
  readonly flushNow: Effect.Effect<void>
}

export function bootCapture(
  ctx: Context,
  runtime: RecorderRuntime,
  clientId: string,
): Effect.Effect<PageCapture, never, Scope.Scope> {
  const recorder = ctx.client.rpc(Recorder)
  const page = ctx.use(Page)
  const connected = accessorStream(() => ctx.servers.get('engine')?.connected === true).pipe(Stream.changes)
  const selector = accessorStream(() => {
    const current = page()
    return current.status === 'active' ? current.value.capture.exclude : undefined
  })
  const controls: Stream.Stream<RecorderControl> = followEvents(
    recorder.events.subscribe('control'),
    FOLLOW_AGAIN,
  ).pipe(
    Stream.map((event) => event.data),
    Stream.catchCause(() => Stream.empty),
  )
  const flushCues = Stream.mergeAll(
    FLUSH_CUES.map(([target, type]) => Stream.fromEventListener(target, type)),
    {concurrency: 'unbounded'},
  )
  const hidden = Stream.fromEventListener(document, 'visibilitychange').pipe(
    Stream.map(() => document.visibilityState === 'hidden'),
  )
  const readConfig = <Failure>(failure: (cause: unknown) => Failure) =>
    Effect.tryPromise({try: (signal) => recorder.config(undefined, {signal}), catch: failure})

  return Effect.gen(function* () {
    const flusher = yield* makeFlusher({
      send: (events) =>
        Effect.tryPromise({
          try: () => recorder.flush({clientId, events: [...events]}),
          catch: (cause) => FlushFailed.make({cause}),
        }),
    })
    const boot = yield* runBoot({
      connected,
      readLive: Effect.tryPromise({
        try: (signal) => recorder.state(undefined, {signal}),
        catch: (cause) => StateReadFailed.make({cause}),
      }).pipe(Effect.map((current) => current.live)),
      controls,
      selector,
      prepare: (exclude) =>
        Effect.all({
          library: loadCaptureLibrary,
          config: readConfig((cause) => ConfigReadFailed.make({cause})),
        }).pipe(Effect.map((prepared) => ({...prepared, exclude}))),
      open: (prepared, onFailed) =>
        Effect.asVoid(
          openCaptureSession({
            config: prepared.config,
            record: recordPage(
              prepared.library,
              prepared.exclude,
              (event) => void runtime.runSyncExit(flusher.push(event)),
            ),
            takeSnapshot: takeFreshSnapshot(prepared.library),
            reloadConfig: readConfig((cause) => ConfigReloadFailed.make({cause})),
            flusher,
            controls,
            flushCues,
            hidden,
            onFailed,
          }),
        ),
    })
    return {boot, flushNow: flusher.flushNow}
  })
}

const APPENDED_EVENT = 'rpc.recorder.appended'

const AppendedHere = z.object({clientId: z.string()})

export function followClient(ctx: Context, clientId: string): (cursor: number) => Stream.Stream<ReplaySource> {
  const recorder = ctx.client.rpc(Recorder)
  const cues = followEvents(ctx.client.event.subscribe({types: [APPENDED_EVENT]}), FOLLOW_AGAIN).pipe(
    Stream.filter(
      (event) => event.type === 'server.connected' || AppendedHere.safeParse(event.data).data?.clientId === clientId,
    ),
  )
  return (cursor) =>
    followRecording({
      cursor,
      cues,
      readSince: (from) =>
        Effect.tryPromise({
          try: (signal) => recorder.since({clientId, cursor: from}, {signal}),
          catch: (cause) => FollowFailed.make({cause}),
        }),
    })
}
