import {z} from 'zod'
import {EventType, type StreamChunk} from '@tanstack/ai'
import type {ChatHistory} from './chat-types.js'

export const UiFormFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(['text', 'select']),
  options: z.array(z.string()).optional(),
})

export type UiFormField = z.infer<typeof UiFormFieldSchema>

const MessagesSnapshotChunkSchema = z.custom<StreamChunk>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === EventType.MESSAGES_SNAPSHOT &&
    'messages' in value &&
    Array.isArray(value.messages),
)

export function aguiSnapshotFor(messages: ChatHistory): StreamChunk {
  return MessagesSnapshotChunkSchema.parse({type: EventType.MESSAGES_SNAPSHOT, messages})
}

export const UiInputSchema = z.object({
  kind: z.enum(['choices', 'confirm', 'diff', 'form']),
  question: z.string().optional(),
  detail: z.string().optional(),
  options: z.array(z.string()).optional(),
  file: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  title: z.string().optional(),
  fields: z.array(UiFormFieldSchema).optional(),
  multiSelect: z.boolean().optional(),
  allowOther: z.boolean().optional(),
})

export const UiAnswerValueSchema = z.union([z.string(), z.array(z.string()), z.record(z.string(), z.string())])

export const UiAnswerSchema = z.union([
  z.object({answered: z.literal(true), value: UiAnswerValueSchema}),
  z.object({answered: z.literal(false), note: z.string()}),
])

export type UiInput = z.infer<typeof UiInputSchema>
export type UiAnswerValue = z.infer<typeof UiAnswerValueSchema>
export type UiAnswer = z.infer<typeof UiAnswerSchema>
