import {join} from 'node:path'
import {Plugin, type Rpc} from '@conciv/plugin/effect'
import type {Context} from '@conciv/plugin/effect/plugin'
import {Effect, Queue, Stream} from 'effect'
import {MAX_FILE_BYTES, Recorder} from './rpc.js'
import {createCaptureControl} from './capture-control.js'
import {distill} from './distill.js'
import {createRecordingStore} from './recordings.js'
import {createChromiumRenderer} from './render.js'
import {createRendererCache} from './renderer-cache.js'
import {createClientRings} from './rings.js'
import {readVideoPiece, renderedVideo} from './video.js'
import type {RecorderRuntime} from './runtime.js'
import {recorderConfig, recordingSummary} from './protocol.js'
import {info} from './skill.js'
import {register} from './tools.js'

const RESET_SNAPSHOT_WAIT_MS = 1500

const OK: {ok: true} = {ok: true}

const VIDEO: {name: 'recording.webm'; mime: 'video/webm'} = {name: 'recording.webm', mime: 'video/webm'}

function recordingsDirectory(projectDirectory: string): string {
  return join(projectDirectory, '.conciv', 'recorder', 'recordings')
}

type Announcement = Rpc.EventInput<typeof Recorder>

type Announce = (event: Announcement) => void

function reportUndelivered(error: unknown) {
  return Effect.sync(() => {
    console.error(`[recorder] a recorder event was not delivered: ${String(error)}`)
  })
}

function registerRpc(rpc: Context['rpc'], runtime: RecorderRuntime, announce: Announce) {
  return rpc.register(Recorder, {
    config: () => Effect.sync(() => runtime.config),
    clients: () => Effect.sync(() => ({clients: runtime.rings.clients()})),
    flush: (input) =>
      Effect.sync(() => {
        runtime.rings.append(input.clientId, input.events)
        announce(['appended', {clientId: input.clientId, cursor: runtime.rings.head(input.clientId)}])
        return OK
      }),
    window: (input) =>
      Effect.sync(() => ({
        events: runtime.rings.window(input, input.clientId),
        cursor: runtime.rings.head(input.clientId),
      })),
    since: (input) =>
      Effect.sync(() => ({
        events: runtime.rings.since(input.cursor, input.clientId),
        cursor: runtime.rings.head(input.clientId),
      })),
    state: () => Effect.sync(() => ({live: runtime.control.isLive()})),
    presence: (input) =>
      Effect.sync(() => {
        if (!input.live) runtime.control.dropViewer(input.viewerId)
        const joined = input.live ? runtime.control.renewViewer(input.viewerId) : false
        if (joined) runtime.control.emit({snapshot: true, flush: true})
        return OK
      }),
    reset: () =>
      Effect.gen(function* () {
        runtime.rings.clear()
        const appendCursor = runtime.control.emit({snapshot: true, flush: true})
        yield* Effect.promise(() => runtime.control.awaitAppendAfter(appendCursor, RESET_SNAPSHOT_WAIT_MS))
        return OK
      }),
    log: (input) => Effect.sync(() => ({entries: distill(runtime.rings.window(input, input.clientId))})),
    'recordings.save': (input) =>
      Effect.promise(() => runtime.recordings.save(runtime.rings.window(input, input.clientId))).pipe(
        Effect.map((stored) =>
          stored.saved
            ? {saved: true, recordingId: stored.recordingId, summary: recordingSummary(distill(stored.events))}
            : stored,
        ),
      ),
    'recordings.get': (input) => Effect.promise(() => runtime.recordings.get(input.recordingId)),
    'recordings.exportVideo': (input, call) =>
      Effect.gen(function* () {
        const file = runtime.recordings.videoFile(input.id)
        const recording = yield* Effect.promise(() => runtime.recordings.get(input.id))
        if (recording.kind === 'expired')
          return yield* Effect.fail(call.error('expired', `The recording ${input.id} has expired`))
        if (!file || recording.kind === 'missing')
          return yield* Effect.fail(call.error('missing', `There is no saved recording ${input.id}`))
        const rendered = yield* Effect.promise(() => renderedVideo(file, recording.events, runtime.useRenderer))
        if (!rendered)
          return yield* Effect.fail(
            call.error('render-failed', `The recording ${input.id} could not be rendered to video`),
          )
        const piece = yield* Effect.promise(() => readVideoPiece(file, input.offset, MAX_FILE_BYTES))
        return {...piece, ...VIDEO}
      }),
  })
}

export default Plugin.define({
  id: 'recorder',
  effect: (ctx) =>
    Effect.gen(function* () {
      const config = yield* Effect.sync(() => recorderConfig.parse(ctx.options))
      const rings = createClientRings({windowMs: config.windowMinutes * 60_000})
      const control = createCaptureControl(rings)
      const rendererCache = createRendererCache(createChromiumRenderer)
      const recordings = createRecordingStore(recordingsDirectory(ctx.location.directory))
      yield* Effect.tryPromise({try: () => recordings.sweep(), catch: (error) => error}).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            console.error(`[recorder] sweeping old recordings failed: ${String(error)}`)
          }),
        ),
        Effect.forkScoped({startImmediately: true}),
      )
      const runtime: RecorderRuntime = {
        rings,
        control,
        config,
        useRenderer: (work) => rendererCache.use(work),
        recordings,
      }
      const announcements = yield* Queue.unbounded<Announcement>()
      const announce: Announce = (event) => {
        Queue.offerUnsafe(announcements, event)
      }
      yield* register(ctx, runtime)
      yield* ctx.skill.transform((editor) => editor.add(info))
      const registration = yield* registerRpc(ctx.rpc, runtime, announce).pipe(Effect.orDie)
      yield* Stream.fromQueue(announcements).pipe(
        Stream.runForEach((event) =>
          registration.events
            .emit(...event)
            .pipe(Effect.catch(reportUndelivered), Effect.catchDefect(reportUndelivered)),
        ),
        Effect.forkScoped({startImmediately: true}),
      )
      const unsubscribe = control.subscribe((message) => announce(['control', message]))
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          unsubscribe()
          control.dispose()
        }).pipe(Effect.andThen(Effect.promise(() => rendererCache.dispose()))),
      )
    }),
})
