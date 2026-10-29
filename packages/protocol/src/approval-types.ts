import {z} from 'zod'
import {EventType, type CustomEvent, type StreamChunk} from '@tanstack/ai'

export const APPROVAL_REQUESTED_EVENT = 'approval-requested'

export const APPROVAL_SETTLED_EVENT = 'conciv.approval-settled'

export const ApprovalAskSchema = z.object({
  approvalId: z.string().min(1),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  input: z.unknown(),
})

export type ApprovalAsk = z.infer<typeof ApprovalAskSchema>

const ApprovalRequestedChunkSchema = z.looseObject({
  type: z.literal(EventType.CUSTOM),
  name: z.literal(APPROVAL_REQUESTED_EVENT),
  value: z.looseObject({
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    input: z.unknown(),
    approval: z.looseObject({id: z.string().min(1)}),
  }),
})

const ApprovalSettledChunkSchema = z.looseObject({
  type: z.literal(EventType.CUSTOM),
  name: z.literal(APPROVAL_SETTLED_EVENT),
  value: z.looseObject({approvalId: z.string().min(1)}),
})

export function approvalAskOf(chunk: StreamChunk): ApprovalAsk | null {
  const parsed = ApprovalRequestedChunkSchema.safeParse(chunk)
  if (!parsed.success) return null
  const {toolCallId, toolName, input, approval} = parsed.data.value
  return {approvalId: approval.id, toolCallId, toolName, input}
}

export function approvalSettledChunk(approvalId: string): CustomEvent {
  return {type: EventType.CUSTOM, name: APPROVAL_SETTLED_EVENT, value: {approvalId}}
}

export function approvalSettledOf(chunk: StreamChunk): string | null {
  const parsed = ApprovalSettledChunkSchema.safeParse(chunk)
  return parsed.success ? parsed.data.value.approvalId : null
}
