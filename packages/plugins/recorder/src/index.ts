import {join} from 'node:path'
import {Plugin, type Rpc} from '@conciv/plugin'
import {Recorder} from './rpc.js'
import {createCaptureControl} from './server/capture-control.js'
import {distill} from './server/distill.js'
import {createRecordingStore} from './server/recordings.js'
import {createChromiumRenderer} from './server/render.js'
import {createRendererCache} from './server/renderer-cache.js'
import {createClientRings} from './server/rings.js'
import type {RecorderRuntime} from './server/runtime.js'
import {recorderConfig} from './shared/protocol.js'

const RESET_SNAPSHOT_WAIT_MS = 1500

const OK: {ok: true} = {ok: true}

const EXPIRED: {expired: true} = {expired: true}

type Announce = (...event: Rpc.EventInput<typeof Recorder>) => void

function registerRpc(rpc: Plugin.Context['rpc'], runtime: RecorderRuntime, announce: Announce) {
  return rpc.register(Recorder, {
    config: async () => runtime.config,
    clients: async () => ({clients: runtime.rings.clients()}),
    flush: async (input) => {
      runtime.rings.append(input.clientId, input.events)
      announce('appended', {clientId: input.clientId, cursor: runtime.rings.head(input.clientId)})
      return OK
    },
    window: async (input) => ({
      events: runtime.rings.window(input, input.clientId),
      cursor: runtime.rings.head(input.clientId),
    }),
    since: async (input) => ({
      events: runtime.rings.since(input.cursor, input.clientId),
      cursor: runtime.rings.head(input.clientId),
    }),
    state: async () => ({live: runtime.control.isLive()}),
    reset: async () => {
      runtime.rings.clear()
      const appendCursor = runtime.control.emit({snapshot: true, flush: true})
      await runtime.control.awaitAppendAfter(appendCursor, RESET_SNAPSHOT_WAIT_MS)
      return OK
    },
    log: async (input) => ({entries: distill(runtime.rings.window(input, input.clientId))}),
    'recordings.save': async (input) => {
      const saved = await runtime.recordings.save(runtime.rings.window(input, input.clientId))
      return saved.ok ? {recordingId: saved.recordingId} : {error: saved.reason}
    },
    'recordings.get': async (input) => {
      const events = await runtime.recordings.get(input.recordingId)
      return events ? {events} : EXPIRED
    },
  })
}

export default Plugin.define({
  id: 'recorder',
  async setup(ctx) {
    const config = recorderConfig.parse(ctx.options)
    const rings = createClientRings({windowMs: config.windowMinutes * 60_000})
    const control = createCaptureControl(rings)
    const rendererCache = createRendererCache(createChromiumRenderer)
    const recordings = createRecordingStore(join(ctx.storage.directory, 'recordings'))
    recordings.sweep().catch((error: unknown) => {
      console.error(`[recorder] sweeping old recordings failed: ${String(error)}`)
    })
    const runtime: RecorderRuntime = {
      rings,
      control,
      config,
      useRenderer: (work) => rendererCache.use(work),
      recordings,
    }
    const announce: Announce = (...event) => {
      registration
        .then((registered) => registered.events.emit(...event))
        .catch((error: unknown) => {
          console.error(`[recorder] a recorder event was not delivered: ${String(error)}`)
        })
    }
    const registration = registerRpc(ctx.rpc, runtime, announce)
    await registration
    control.subscribe((message) => announce('control', message))
  },
})
