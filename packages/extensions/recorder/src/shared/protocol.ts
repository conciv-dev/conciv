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

export const RecorderControlSchema = z.object({live: z.boolean().optional(), flush: z.boolean().optional()})

export type RecorderControl = z.infer<typeof RecorderControlSchema>

export type ActionLogKind = 'click' | 'input' | 'navigation' | 'scroll' | 'console' | 'reload'

export type ActionLogEntry = {ts: number; kind: ActionLogKind; detail: string}

export type Keyframe = {ts: number; pngBase64: string}
