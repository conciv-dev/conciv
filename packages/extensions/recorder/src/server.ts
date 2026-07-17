import {eventIterator, os} from '@orpc/server'
import {z} from 'zod'
import {defineExtension, subscriptionIterator} from '@conciv/extension'
import {RECORDER_NAME, RecorderControlSchema, RrwebEventSchema, recorderConfig} from './shared/protocol.js'
import {createEventRing} from './server/ring.js'
import {createCaptureHub} from './server/hub.js'
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
    log: recorderOs.input(RangeInput).handler(({input}) => ({entries: distill(runtime.ring.window(input))})),
    control: recorderOs.output(eventIterator(RecorderControlSchema)).handler(async function* ({signal}) {
      yield* subscriptionIterator((emit) => runtime.hub.subscribe(emit), signal)
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
  const hub = createCaptureHub(ring)
  const rendererState: {value?: Promise<KeyframeRenderer | null>} = {}
  const renderer = (): Promise<KeyframeRenderer | null> => {
    rendererState.value ??= createChromiumRenderer()
    return rendererState.value
  }
  const runtime: RecorderRuntime = {ring, hub, config: server.config, renderer}
  return {
    context: {recorder: runtime},
    router: makeRecorderRouter(runtime),
    dispose: async () => {
      const active = await rendererState.value?.catch(() => null)
      await active?.dispose()
    },
  }
})
