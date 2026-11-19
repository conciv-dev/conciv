import {Plugin, type Rpc} from '@conciv/plugin/effect'
import type {Context} from '@conciv/plugin/effect/plugin'
import {Effect, FileSystem, Layer, Path, Queue, Stream, Schema} from 'effect'
import {z} from 'zod'
import {MAX_FILE_BYTES, Recorder, recorderConfig, type RecorderConfig, type RrwebEvent} from './rpc.js'
import * as CaptureControlModel from './capture-control.js'
import {CaptureControl} from './capture-control.js'
import {distill, recordingSummary} from './distill.js'
import * as RecordingStoreModel from './recordings.js'
import {RecordingStore} from './recordings.js'
import {launchChromiumRenderer} from './render.js'
import * as RendererCacheModel from './renderer-cache.js'
import * as ClientRingsModel from './rings.js'
import {ClientRings} from './rings.js'
import {readVideoPiece, renderVideoFile} from './video.js'
import {info} from './skill.js'
import {register} from './tools.js'

const ConfigInvalid = Schema.TaggedStruct('RecorderConfigInvalid', {message: Schema.String})
type ConfigInvalid = typeof ConfigInvalid.Type

const RESET_SNAPSHOT_WAIT_MS = 1500

const OK: {ok: true} = {ok: true}

const EXPIRED: {kind: 'expired'} = {kind: 'expired'}

const MISSING: {kind: 'missing'} = {kind: 'missing'}

function foundRecording(events: RrwebEvent[]): {kind: 'found'; events: RrwebEvent[]} {
  return {kind: 'found', events}
}

const VIDEO: {name: 'recording.webm'; mime: 'video/webm'} = {name: 'recording.webm', mime: 'video/webm'}

function recordingsDirectory(path: Path.Path, projectDirectory: string): string {
  return path.join(projectDirectory, '.conciv', 'recorder', 'recordings')
}

type Announcement = Rpc.EventInput<typeof Recorder>

function reportUndelivered(error: unknown) {
  return Effect.logError('a recorder event was not delivered', error)
}

const registerRpc = Effect.fn('recorder.registerRpc')(function* (
  rpc: Context['rpc'],
  config: RecorderConfig,
  announcements: Queue.Queue<Announcement>,
) {
  const rings = yield* ClientRings
  const control = yield* CaptureControl
  const recordings = yield* RecordingStore
  const services = yield* Effect.context<
    ClientRingsModel.ClientRingsInterface | RendererCacheModel.RendererCacheInterface | FileSystem.FileSystem
  >()
  return yield* rpc.register(Recorder, {
    config: () => Effect.succeed(config),
    clients: () => Effect.map(rings.clients, (clients) => ({clients})),
    flush: (input) =>
      Effect.gen(function* () {
        const cursor = yield* rings.append(input.clientId, input.events)
        yield* Queue.offer(announcements, ['appended', {clientId: input.clientId, cursor}])
        return OK
      }),
    window: (input) => Effect.all({events: rings.window(input, input.clientId), cursor: rings.head(input.clientId)}),
    since: (input) =>
      Effect.all({events: rings.since(input.cursor, input.clientId), cursor: rings.head(input.clientId)}),
    state: () => Effect.map(control.isLive, (live) => ({live})),
    presence: (input) =>
      Effect.as(input.live ? control.renewViewer(input.viewerId) : control.dropViewer(input.viewerId), OK),
    reset: () =>
      Effect.gen(function* () {
        yield* rings.clear
        const appendCursor = yield* control.emit({snapshot: true, flush: true})
        yield* control.awaitAppendAfter(appendCursor, RESET_SNAPSHOT_WAIT_MS)
        return OK
      }),
    log: (input) => Effect.map(rings.window(input, input.clientId), (events) => ({entries: distill(events)})),
    'recordings.save': (input) =>
      Effect.flatMap(rings.window(input, input.clientId), recordings.save).pipe(
        Effect.map((stored) =>
          stored.saved
            ? {saved: stored.saved, recordingId: stored.recordingId, summary: recordingSummary(distill(stored.events))}
            : stored,
        ),
      ),
    'recordings.get': (input) =>
      recordings.get(input.recordingId).pipe(
        Effect.map(foundRecording),
        Effect.catchTags({
          RecorderRecordingExpired: () => Effect.succeed(EXPIRED),
          RecorderRecordingNotFound: () => Effect.succeed(MISSING),
        }),
      ),
    'recordings.exportVideo': (input, call) =>
      Effect.gen(function* () {
        const file = yield* recordings.videoFile(input.id)
        const events = yield* recordings.get(input.id)
        yield* renderVideoFile(file, events)
        const piece = yield* readVideoPiece(file, input.offset, MAX_FILE_BYTES)
        return {...piece, ...VIDEO}
      }).pipe(
        Effect.catchTags({
          RecorderRecordingExpired: () => Effect.fail(call.error('expired', `The recording ${input.id} has expired`)),
          RecorderRecordingNotFound: () =>
            Effect.fail(call.error('missing', `There is no saved recording ${input.id}`)),
          RecorderVideoUnrendered: () =>
            Effect.fail(call.error('render-failed', `The recording ${input.id} could not be rendered to video`)),
          RecorderVideoUnreadable: () =>
            Effect.fail(call.error('unreadable', `The video of the recording ${input.id} could not be read`)),
        }),
        Effect.provideContext(services),
      ),
  })
})

function servicesLayer(config: RecorderConfig, directory: string) {
  const rings = ClientRingsModel.clientRingsLayer({windowMs: config.windowMinutes * 60_000})
  return Layer.mergeAll(
    CaptureControlModel.captureControlLayer.pipe(Layer.provideMerge(rings)),
    RecordingStoreModel.recordingStoreLayer(directory),
    RendererCacheModel.rendererCacheLayer(launchChromiumRenderer),
  )
}

export default Plugin.define<Plugin.Services, ConfigInvalid>({
  id: 'recorder',
  effect: (ctx) =>
    Effect.gen(function* () {
      const parsed = recorderConfig.safeParse(ctx.options)
      if (!parsed.success) return yield* Effect.fail(ConfigInvalid.make({message: z.prettifyError(parsed.error)}))
      const config = parsed.data
      const path = yield* Path.Path
      const services = yield* Layer.build(servicesLayer(config, recordingsDirectory(path, ctx.location.directory)))
      yield* Effect.gen(function* () {
        const recordings = yield* RecordingStore
        const control = yield* CaptureControl
        yield* Effect.forkScoped(recordings.sweep, {startImmediately: true})
        const announcements = yield* Queue.unbounded<Announcement>()
        yield* register(ctx)
        yield* ctx.skill.transform((editor) => editor.add(info))
        const registration = yield* registerRpc(ctx.rpc, config, announcements).pipe(Effect.orDie)
        yield* Stream.fromQueue(announcements).pipe(
          Stream.merge(Stream.map(control.controls, (message): Announcement => ['control', message])),
          Stream.runForEach((event) =>
            registration.events
              .emit(...event)
              .pipe(Effect.catch(reportUndelivered), Effect.catchDefect(reportUndelivered)),
          ),
          Effect.forkScoped({startImmediately: true}),
        )
      }).pipe(Effect.provideContext(services))
    }),
})
