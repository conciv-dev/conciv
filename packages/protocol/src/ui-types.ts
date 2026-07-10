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

export const APPROVAL_REQUESTED_EVENT = 'approval-requested'

export type ApprovalRequest = {toolCallId: string; toolName: string; input: unknown; approvalId: string}

export function aguiApprovalRequestedFor(req: ApprovalRequest): StreamChunk {
  return {
    type: EventType.CUSTOM,
    name: APPROVAL_REQUESTED_EVENT,
    value: {toolCallId: req.toolCallId, toolName: req.toolName, input: req.input, approval: {id: req.approvalId}},
  }
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
})

export const UiAnswerValueSchema = z.union([z.string(), z.record(z.string(), z.string())])

export const UiAnswerSchema = z.union([
  z.object({answered: z.literal(true), value: UiAnswerValueSchema}),
  z.object({answered: z.literal(false), note: z.string()}),
])

export type UiInput = z.infer<typeof UiInputSchema>
export type UiAnswerValue = z.infer<typeof UiAnswerValueSchema>
export type UiAnswer = z.infer<typeof UiAnswerSchema>
