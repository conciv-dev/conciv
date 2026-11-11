import {join} from 'node:path'
import {eventIterator, os, withEventMeta, type Procedure, type Schema} from '@orpc/server'
import {z} from 'zod'
import {defineExtension, subscriptionIterator} from '@conciv/extension'
import {
  MAX_FLUSH_BYTES,
  RECORDER_NAME,
  REPLAY_MIN_EVENTS,
  RecorderControlSchema,
  RrwebEventSchema,
  jsonByteLength,
  recorderConfig,
  type ActionLogEntry,
  type RecorderConfig,
  type RecorderControl,
  type RrwebEvent,
} from './shared/protocol.js'
import {createClientRings, type ClientRings, type ClientSummary} from './server/rings.js'
import {createRecordingStore} from './server/recordings.js'
import {createCaptureControl} from './server/capture-control.js'
import {createChromiumRenderer} from './server/render.js'
import {createRendererCache} from './server/renderer-cache.js'
import {distill} from './server/distill.js'
import type {RecorderRuntime} from './server/runtime.js'
import {recordingAttachment} from './server/attachment.js'
import {pullTool, startTool, stopTool} from './tool/server.js'

const recorderOs = os.$context<{request: Request}>()

const ClientId = z.string().min(1).max(128)

const RangeInput = z.object({fromTs: z.number().optional(), toTs: z.number().optional(), clientId: ClientId})

const MAX_FLUSH_EVENTS = 5000

const ResumeCursor = z.coerce.number().int().nonnegative()

const FlushInput = z
  .object({clientId: ClientId, events: z.array(RrwebEventSchema).max(MAX_FLUSH_EVENTS)})
  .refine((input) => jsonByteLength(input.events) <= MAX_FLUSH_BYTES)

const EventsInput = z.object({cursor: z.number(), clientId: ClientId})
const PresenceInput = z.object({viewerId: z.string().min(1).max(128), live: z.boolean()})
const RecordingInput = z.object({recordingId: z.string()})
const OkOutput = z.object({ok: z.literal(true)})
const SaveOutput = z.union([
  z.object({recordingId: z.string()}),
  z.object({error: z.enum(['too-large', 'empty', 'io-error'])}),
])
const ExportOutput = z.union([z.instanceof(File), z.object({error: z.enum(['expired', 'render-failed'])})])

type RecorderProcedure<Input extends Schema<unknown, unknown>, Output extends Schema<unknown, unknown>> = Procedure<
  {request: Request},
  {request: Request},
  Input,
  Output,
  Record<never, never>,
  Record<never, never>
>
type NoInput = Schema<unknown, unknown>
type Returns<Output> = Schema<Output, Output>
type WindowChunk = {events: RrwebEvent[]; cursor: number}
type EventWindow = Returns<WindowChunk>
type EventWindowStream = Returns<AsyncGenerator<WindowChunk, void, unknown>>
type Recording = Returns<{events: RrwebEvent[]; expired?: undefined} | {events?: undefined; expired: true}>
type ControlStream = ReturnType<typeof eventIterator<z.input<typeof RecorderControlSchema>, RecorderControl>>
export type RecorderRouter = {
  config: RecorderProcedure<NoInput, Returns<RecorderConfig>>
  clients: RecorderProcedure<NoInput, Returns<{clients: ClientSummary[]}>>
  flush: RecorderProcedure<typeof FlushInput, typeof OkOutput>
  window: RecorderProcedure<typeof RangeInput, EventWindow>
  replay: RecorderProcedure<typeof RangeInput, EventWindowStream>
  events: RecorderProcedure<typeof EventsInput, EventWindowStream>
  presence: RecorderProcedure<typeof PresenceInput, typeof OkOutput>
  reset: RecorderProcedure<NoInput, typeof OkOutput>
  log: RecorderProcedure<typeof RangeInput, Returns<{entries: ActionLogEntry[]}>>
  recordings: {
    save: RecorderProcedure<typeof RangeInput, typeof SaveOutput>
    get: RecorderProcedure<typeof RecordingInput, Recording>
    exportVideo: RecorderProcedure<typeof RecordingInput, typeof ExportOutput>
  }
  control: RecorderProcedure<NoInput, ControlStream>
}

export function makeRecorderRouter(runtime: RecorderRuntime): RecorderRouter {
  return recorderOs.router({
    config: recorderOs.handler(() => runtime.config),
    clients: recorderOs.handler(() => ({clients: runtime.rings.clients()})),
    flush: recorderOs
      .input(FlushInput)
      .output(OkOutput)
      .handler(({input}) => {
        runtime.rings.append(input.clientId, input.events)
        return {ok: true}
      }),
    window: recorderOs.input(RangeInput).handler(({input}) => ({
      events: runtime.rings.window(input, input.clientId),
      cursor: runtime.rings.head(input.clientId),
    })),
    replay: recorderOs.input(RangeInput).handler(async function* ({input, signal}) {
      for await (const cursor of clientHeads(runtime.rings, input.clientId, signal)) {
        const events = runtime.rings.window(input, input.clientId)
        yield {events, cursor}
        if (events.length >= REPLAY_MIN_EVENTS) return
      }
    }),
    events: recorderOs.input(EventsInput).handler(async function* ({input, signal, lastEventId}) {
      const resumed = ResumeCursor.safeParse(lastEventId)
      let cursor = resumed.success ? resumed.data : input.cursor
      for await (const head of clientHeads(runtime.rings, input.clientId, signal)) {
        if (head <= cursor) continue
        const events = runtime.rings.since(cursor, input.clientId)
        cursor = head
        yield withEventMeta({events, cursor}, {id: String(cursor)})
      }
    }),
    presence: recorderOs
      .input(PresenceInput)
      .output(OkOutput)
      .handler(({input}) => {
        if (!input.live) runtime.control.dropViewer(input.viewerId)
        const joined = input.live ? runtime.control.renewViewer(input.viewerId) : false
        if (joined) runtime.control.emit({snapshot: true, flush: true})
        return {ok: true}
      }),
    reset: recorderOs.output(OkOutput).handler(async () => {
      runtime.rings.clear()
      const appendCursor = runtime.control.emit({snapshot: true, flush: true})
      await runtime.control.awaitAppendAfter(appendCursor, 1500)
      return {ok: true}
    }),
    log: recorderOs
      .input(RangeInput)
      .handler(({input}) => ({entries: distill(runtime.rings.window(input, input.clientId))})),
    recordings: recorderOs.router({
      save: recorderOs
        .input(RangeInput)
        .output(SaveOutput)
        .handler(async ({input}) => {
          const saved = await runtime.recordings.save(runtime.rings.window(input, input.clientId))
          return saved.ok ? {recordingId: saved.recordingId} : {error: saved.reason}
        }),
      get: recorderOs.input(RecordingInput).handler(async ({input}) => {
        const events = await runtime.recordings.get(input.recordingId)
        return events ? {events} : {expired: true as const}
      }),
      exportVideo: recorderOs
        .input(RecordingInput)
        .output(ExportOutput)
        .handler(async ({input}) => {
          const events = await runtime.recordings.get(input.recordingId)
          if (!events) return {error: 'expired'}
          const video = await runtime.useRenderer((renderer) => renderer.renderVideo(events)).catch(() => null)
          if (!video) return {error: 'render-failed'}
          return new File([new Uint8Array(video)], 'recording.webm', {type: 'video/webm'})
        }),
    }),
    control: recorderOs.output(eventIterator(RecorderControlSchema)).handler(async function* ({signal}) {
      yield* subscriptionIterator((emit) => {
        const unsubscribe = runtime.control.subscribe(emit)
        emit({live: runtime.control.isLive()})
        return unsubscribe
      }, signal)
    }),
  })
}

async function* clientHeads(
  rings: ClientRings,
  clientId: string,
  signal: AbortSignal | undefined,
): AsyncGenerator<number, void, void> {
  let last = -1
  const heads = subscriptionIterator<number>((emit) => {
    emit(rings.head(clientId))
    return rings.onAppend(() => emit(rings.head(clientId)))
  }, signal)
  for await (const head of heads) {
    if (head === last) continue
    last = head
    yield head
  }
}

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
    useRenderer: (work) => rendererCache.use(work),
    recordings,
  }
  return {
    context: {recorder: runtime},
    router: makeRecorderRouter(runtime),
    dispose: async () => {
      control.dispose()
      await rendererCache.dispose()
    },
  }
})
