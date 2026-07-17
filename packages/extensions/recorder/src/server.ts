import {join} from 'node:path'
import {eventIterator, os} from '@orpc/server'
import {z} from 'zod'
import {defineExtension, subscriptionIterator} from '@conciv/extension'
import {RECORDER_NAME, RecorderControlSchema, RrwebEventSchema, recorderConfig} from './shared/protocol.js'
import {createEventRing} from './server/ring.js'
import {createRecordingStore} from './server/recordings.js'
import {createCaptureControl} from './server/capture-control.js'
import {createChromiumRenderer, type KeyframeRenderer} from './server/render.js'
import {distill} from './server/distill.js'
import type {RecorderRuntime} from './server/runtime.js'
import {pullTool, startTool, stopTool} from './tool/server.js'

const recorderOs = os.$context<{request: Request}>()

const RangeInput = z.object({fromTs: z.number().optional(), toTs: z.number().optional()})

export function makeRecorderRouter(runtime: RecorderRuntime) {
  return recorderOs.router({
    config: recorderOs.handler(() => runtime.config),
    flush: recorderOs
      .input(z.object({clientId: z.string(), events: z.array(RrwebEventSchema)}))
      .output(z.object({ok: z.literal(true)}))
      .handler(({input}) => {
        runtime.ring.append(input.clientId, input.events)
        return {ok: true}
      }),
    window: recorderOs.input(RangeInput).handler(({input}) => ({events: runtime.ring.window(input)})),
    reset: recorderOs.output(z.object({ok: z.literal(true)})).handler(async () => {
      runtime.ring.clear()
      runtime.control.emit({snapshot: true, flush: true})
      await runtime.control.awaitNextAppend(1500)
      return {ok: true}
    }),
    log: recorderOs.input(RangeInput).handler(({input}) => ({entries: distill(runtime.ring.window(input))})),
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
}).server((server) => {
  const ring = createEventRing({windowMs: server.config.windowMinutes * 60_000})
  const control = createCaptureControl(ring)
  const rendererState: {value?: Promise<KeyframeRenderer | null>} = {}
  const renderer = (): Promise<KeyframeRenderer | null> => {
    rendererState.value ??= createChromiumRenderer()
    return rendererState.value
  }
  const recordings = createRecordingStore(join(server.cwd, '.conciv', 'recorder', 'recordings'))
  void recordings.sweep()
  const runtime: RecorderRuntime = {ring, control, config: server.config, renderer, recordings}
  return {
    context: {recorder: runtime},
    router: makeRecorderRouter(runtime),
    dispose: async () => {
      const active = await rendererState.value?.catch(() => null)
      await active?.dispose()
    },
  }
})
