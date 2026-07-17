import type {Keyframe, RecorderConfig} from '../shared/protocol.js'
import type {EventRing} from './ring.js'
import type {CaptureHub} from './hub.js'
import type {KeyframeRenderer} from './render.js'
import {distill} from './distill.js'
import {pickKeyframeTimestamps, recordingParts} from './format.js'

export type RecorderRuntime = {
  ring: EventRing
  hub: CaptureHub
  config: RecorderConfig
  renderer: () => Promise<KeyframeRenderer | null>
}

export async function pullWindow(
  runtime: RecorderRuntime,
  fromTs: number,
  toTs: number,
  keyframeCount: number,
): Promise<unknown> {
  const events = runtime.ring.window({fromTs, toTs})
  const log = distill(events).filter((entry) => entry.ts >= fromTs)
  const frames = await renderFrames(runtime, events, log, keyframeCount)
  return recordingParts(log, frames, keyframeCount > 0)
}

async function renderFrames(
  runtime: RecorderRuntime,
  events: ReturnType<EventRing['window']>,
  log: ReturnType<typeof distill>,
  keyframeCount: number,
): Promise<Keyframe[]> {
  if (!keyframeCount || events.length < 2) return []
  const renderer = await runtime.renderer().catch(() => null)
  if (!renderer) return []
  const lastTs = events.at(-1)?.timestamp ?? 0
  return renderer.render(events, pickKeyframeTimestamps(log, lastTs, keyframeCount)).catch(() => [])
}
