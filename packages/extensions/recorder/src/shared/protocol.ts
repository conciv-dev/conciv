import {z} from 'zod'

export const RECORDER_NAME = 'recorder'

export const recorderConfig = z.object({
  masking: z.enum(['none', 'inputs', 'sensitive']).default('none'),
  windowMinutes: z.number().int().positive().max(60).default(10),
  console: z.boolean().default(true),
})

export type RecorderConfig = z.output<typeof recorderConfig>

export type RrwebEvent = {type: number; data: unknown; timestamp: number}

export const RrwebEventSchema = z.object({type: z.number(), data: z.unknown(), timestamp: z.number()})

export const RecorderControlSchema = z.object({
  live: z.boolean().optional(),
  flush: z.boolean().optional(),
  snapshot: z.boolean().optional(),
})

export type RecorderControl = z.infer<typeof RecorderControlSchema>

export type ActionLogKind = 'click' | 'input' | 'navigation' | 'scroll' | 'console' | 'reload'

export type ActionLogEntry = {ts: number; kind: ActionLogKind; detail: string}

export const RECORDER_MIME = 'application/x-conciv-recorder'

export const RecordingRefSchema = z.object({recordingId: z.string().min(1), poster: z.string()})
export type RecordingRef = z.infer<typeof RecordingRefSchema>

export function recordingRefJson(ref: RecordingRef): string {
  return JSON.stringify(ref)
}

export function parseRecordingRefJson(json: string): RecordingRef | null {
  try {
    const parsed = RecordingRefSchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function decodeRecordingRef(value: string): RecordingRef | null {
  try {
    return parseRecordingRefJson(atob(value))
  } catch {
    return null
  }
}

export function recordingPoster(entries: ActionLogEntry[]): string {
  const first = entries[0]?.ts ?? 0
  const last = entries.at(-1)?.ts ?? first
  const seconds = Math.max(0, Math.round((last - first) / 1000))
  return `Screen recording · ${entries.length} action${entries.length === 1 ? '' : 's'} · ${seconds}s`
}

export type Keyframe = {ts: number; pngBase64: string}
