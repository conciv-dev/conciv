import {imageResult} from '@conciv/extension'
import type {ActionLogEntry, Keyframe} from '../shared/protocol.js'

const SIGNIFICANT: ReadonlySet<string> = new Set(['click', 'navigation', 'console', 'reload'])

export function pickKeyframeTimestamps(log: ActionLogEntry[], lastTs: number, count: number): number[] {
  if (count < 1) return []
  const significant = log.filter((entry) => SIGNIFICANT.has(entry.kind)).map((entry) => entry.ts)
  const picked = [...significant.slice(-Math.max(count - 1, 0)), lastTs]
  return [...new Set(picked)].toSorted((a, b) => a - b).slice(-count)
}

function formatLog(log: ActionLogEntry[], opts: {keyframesSkipped: boolean}): string {
  if (!log.length) return 'No recorded activity in this window.'
  const start = log[0]?.ts ?? 0
  const lines = log.map((entry) => `+${((entry.ts - start) / 1000).toFixed(1)}s [${entry.kind}] ${entry.detail}`)
  const note = opts.keyframesSkipped ? '\n(keyframes skipped: no renderer available)' : ''
  return `${lines.join('\n')}${note}`
}

export function recordingParts(log: ActionLogEntry[], frames: Keyframe[], keyframesRequested: boolean): unknown {
  const skipped = keyframesRequested && frames.length === 0
  const text = {type: 'text', content: formatLog(log, {keyframesSkipped: skipped})}
  const images = frames.flatMap((frame) => imageResult('image/png', frame.pngBase64))
  return [...images, text]
}
