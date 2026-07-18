import type {ContentPart} from '@conciv/extension'
import type {Keyframe, RecorderConfig, RrwebEvent} from '../shared/protocol.js'
import type {ClientRings} from './rings.js'
import type {CaptureControl} from './capture-control.js'
import type {KeyframeRenderer} from './render.js'
import type {RecordingStore} from './recordings.js'
import {distill} from './distill.js'
import {pickKeyframeTimestamps, recordingParts} from './format.js'

export type RecorderRuntime = {
  rings: ClientRings
  control: CaptureControl
  config: RecorderConfig
  renderer: () => Promise<KeyframeRenderer | null>
  recordings: RecordingStore
}

export async function renderRecording(
  runtime: RecorderRuntime,
  events: RrwebEvent[],
  keyframeCount: number,
): Promise<ContentPart[]> {
  const log = distill(events)
  const frames = await renderFrames(runtime, events, log, keyframeCount)
  return recordingParts(log, frames, keyframeCount > 0)
}

export async function pullWindow(
  runtime: RecorderRuntime,
  fromTs: number,
  toTs: number,
  keyframeCount: number,
): Promise<unknown> {
  const events = runtime.rings.window({fromTs, toTs})
  const log = distill(events).filter((entry) => entry.ts >= fromTs)
  const frames = await renderFrames(runtime, events, log, keyframeCount)
  return recordingParts(log, frames, keyframeCount > 0)
}

async function renderFrames(
  runtime: RecorderRuntime,
  events: RrwebEvent[],
  log: ReturnType<typeof distill>,
  keyframeCount: number,
): Promise<Keyframe[]> {
  if (!keyframeCount || events.length < 2) return []
  const renderer = await runtime.renderer().catch(() => null)
  if (!renderer) return []
  const lastTs = events.at(-1)?.timestamp ?? 0
  return renderer.render(events, pickKeyframeTimestamps(log, lastTs, keyframeCount)).catch(() => [])
}
