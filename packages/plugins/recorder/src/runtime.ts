import {Effect, Option} from 'effect'
import type {RrwebEvent} from './rpc.js'
import {ClientRings} from './rings.js'
import {RendererCache} from './renderer-cache.js'
import {distill} from './distill.js'
import {pickKeyframeTimestamps, recordingParts} from './format.js'

export const MAX_SECONDS_BACK = 600

const renderFrames = Effect.fn('recorder.renderFrames')(function* (
  events: RrwebEvent[],
  log: ReturnType<typeof distill>,
  keyframeCount: number,
) {
  if (!keyframeCount || events.length < 2) return []
  const lastTs = events.at(-1)?.timestamp ?? 0
  const renderers = yield* RendererCache
  const frames = yield* renderers
    .use((renderer) => renderer.render(events, pickKeyframeTimestamps(log, lastTs, keyframeCount)))
    .pipe(Effect.catch((failed) => Effect.as(Effect.logError('rendering the keyframes failed', failed), Option.none())))
  return Option.getOrElse(frames, () => [])
})

export const renderRecording = Effect.fn('recorder.renderRecording')(function* (
  events: RrwebEvent[],
  keyframeCount: number,
) {
  const fromTs = (events.at(-1)?.timestamp ?? 0) - MAX_SECONDS_BACK * 1000
  const log = distill(events).filter((entry) => entry.ts >= fromTs)
  const frames = yield* renderFrames(events, log, keyframeCount)
  return recordingParts(log, frames, keyframeCount > 0)
})

export const pullWindow = Effect.fn('recorder.pullWindow')(function* (
  fromTs: number,
  toTs: number,
  keyframeCount: number,
) {
  const rings = yield* ClientRings
  const clientId = (yield* rings.clients).at(-1)?.id
  const events = clientId ? yield* rings.window({fromTs, toTs}, clientId) : []
  const log = distill(events).filter((entry) => entry.ts >= fromTs)
  const frames = yield* renderFrames(events, log, keyframeCount)
  return recordingParts(log, frames, keyframeCount > 0)
})
