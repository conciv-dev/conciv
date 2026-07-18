import {join} from 'node:path'
import {eventIterator, os} from '@orpc/server'
import {z} from 'zod'
import {defineExtension, subscriptionIterator} from '@conciv/extension'
import {RECORDER_NAME, RecorderControlSchema, RrwebEventSchema, recorderConfig} from './shared/protocol.js'
import {createClientRings} from './server/rings.js'
import {createRecordingStore} from './server/recordings.js'
import {createCaptureControl} from './server/capture-control.js'
import {createChromiumRenderer} from './server/render.js'
import {createRendererCache} from './server/renderer-cache.js'
import {distill} from './server/distill.js'
import type {RecorderRuntime} from './server/runtime.js'
import {recordingAttachment} from './server/attachment.js'
import {pullTool, startTool, stopTool} from './tool/server.js'

const recorderOs = os.$context<{request: Request}>()

const ClientId = z.string().min(1).max(128).optional()

const RangeInput = z.object({fromTs: z.number().optional(), toTs: z.number().optional(), clientId: ClientId})

const MAX_FLUSH_EVENTS = 5000
const MAX_FLUSH_BYTES = 8 * 1024 * 1024

const FlushInput = z
  .object({clientId: z.string().min(1).max(128), events: z.array(RrwebEventSchema).max(MAX_FLUSH_EVENTS)})
  .refine((input) => JSON.stringify(input.events).length <= MAX_FLUSH_BYTES)

export function makeRecorderRouter(runtime: RecorderRuntime) {
  return recorderOs.router({
    config: recorderOs.handler(() => runtime.config),
    flush: recorderOs
      .input(FlushInput)
      .output(z.object({ok: z.literal(true)}))
      .handler(({input}) => {
        runtime.rings.append(input.clientId, input.events)
        return {ok: true}
      }),
    window: recorderOs.input(RangeInput).handler(({input}) => ({events: runtime.rings.window(input, input.clientId)})),
    events: recorderOs
      .input(z.object({sinceTs: z.number(), clientId: ClientId}))
      .handler(({input}) => ({events: runtime.rings.since(input.sinceTs, input.clientId)})),
    presence: recorderOs
      .input(z.object({live: z.boolean()}))
      .output(z.object({ok: z.literal(true)}))
      .handler(({input}) => {
        runtime.control.setViewerLive(input.live)
        if (input.live) runtime.control.emit({snapshot: true, flush: true})
        return {ok: true}
      }),
    reset: recorderOs.output(z.object({ok: z.literal(true)})).handler(async () => {
      runtime.rings.clear()
      runtime.control.emit({snapshot: true, flush: true})
      await runtime.control.awaitNextAppend(1500)
      return {ok: true}
    }),
    log: recorderOs
      .input(RangeInput)
      .handler(({input}) => ({entries: distill(runtime.rings.window(input, input.clientId))})),
    recordings: recorderOs.router({
      save: recorderOs
        .input(RangeInput)
        .output(
          z.union([z.object({recordingId: z.string()}), z.object({error: z.enum(['too-large', 'empty', 'io-error'])})]),
        )
        .handler(async ({input}) => {
          const saved = await runtime.recordings.save(runtime.rings.window(input, input.clientId))
          return saved.ok ? {recordingId: saved.recordingId} : {error: saved.reason}
        }),
      get: recorderOs.input(z.object({recordingId: z.string()})).handler(async ({input}) => {
        const events = await runtime.recordings.get(input.recordingId)
        return events ? {events} : {expired: true as const}
      }),
      exportVideo: recorderOs
        .input(z.object({recordingId: z.string()}))
        .output(z.union([z.instanceof(File), z.object({error: z.enum(['expired', 'render-failed'])})]))
        .handler(async ({input}) => {
          const events = await runtime.recordings.get(input.recordingId)
          if (!events) return {error: 'expired'}
          const renderer = await runtime.renderer().catch(() => null)
          const video = renderer ? await renderer.renderVideo(events).catch(() => null) : null
          if (!video) return {error: 'render-failed'}
          return new File([new Uint8Array(video)], 'recording.webm', {type: 'video/webm'})
        }),
    }),
    control: recorderOs.output(eventIterator(RecorderControlSchema)).handler(async function* ({signal}) {
      yield* subscriptionIterator((emit) => runtime.control.subscribe(emit), signal)
    }),
  })
}

export type RecorderRouter = ReturnType<typeof makeRecorderRouter>

export default defineExtension({
  name: RECORDER_NAME,
  configSchema: recorderConfig,
  tools: [startTool, stopTool, pullTool],
  attachments: [recordingAttachment],
}).server((server) => {
  const rings = createClientRings({windowMs: server.config.windowMinutes * 60_000})
  const control = createCaptureControl(rings)
  const rendererCache = createRendererCache(createChromiumRenderer)
  const recordings = createRecordingStore(join(server.stateDir, 'recorder', 'recordings'))
  void recordings.sweep()
  const runtime: RecorderRuntime = {
    rings,
    control,
    config: server.config,
    renderer: () => rendererCache.get(),
    recordings,
  }
  return {
    context: {recorder: runtime},
    router: makeRecorderRouter(runtime),
    turnEnd: () => control.releaseAllCaptures(),
    dispose: async () => {
      control.dispose()
      await rendererCache.dispose()
    },
  }
})
