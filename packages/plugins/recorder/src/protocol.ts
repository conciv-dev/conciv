import {z} from 'zod'

export const recorderConfig = z.object({
  masking: z.enum(['none', 'inputs', 'sensitive']).default('none'),
  windowMinutes: z.number().int().positive().max(60).default(10),
  console: z.boolean().default(true),
})

export type RecorderConfig = z.output<typeof recorderConfig>

export type RrwebEvent = {type: number; data: unknown; timestamp: number}

export const RrwebEventSchema = z.object({type: z.number(), data: z.unknown(), timestamp: z.number()})

export const REPLAY_MIN_EVENTS = 2

export const MAX_FLUSH_BYTES = 8 * 1024 * 1024

const encoder = new TextEncoder()

export function jsonByteLength(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length
}

export const RecorderControlSchema = z.object({
  live: z.boolean().optional(),
  flush: z.boolean().optional(),
  snapshot: z.boolean().optional(),
})

export type RecorderControl = z.infer<typeof RecorderControlSchema>

export type ActionLogKind = 'click' | 'input' | 'navigation' | 'scroll' | 'console' | 'reload'

export type ActionLogEntry = {ts: number; kind: ActionLogKind; detail: string}

export type Keyframe = {ts: number; pngBase64: string}
