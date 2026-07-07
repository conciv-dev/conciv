import {z} from 'zod'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {ChatHistorySchema} from './chat-types.js'

const renderId = z.string().min(1)

export const UiFormFieldSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(['text', 'select']),
  options: z.array(z.string()).optional(),
})

export const UiChoicesSchema = z.object({
  kind: z.literal('choices'),
  renderId,
  question: z.string(),
  options: z.array(z.string()).min(1),
})
export const UiConfirmSchema = z.object({
  kind: z.literal('confirm'),
  renderId,
  question: z.string(),
  detail: z.string().optional(),
})
export const UiDiffSchema = z.object({
  kind: z.literal('diff'),
  renderId,
  file: z.string(),
  before: z.string(),
  after: z.string(),
})
export const UiFormSchema = z.object({
  kind: z.literal('form'),
  renderId,
  title: z.string().optional(),
  fields: z.array(UiFormFieldSchema).min(1),
})

export const UiVitestSchema = z.object({kind: z.literal('vitest'), renderId})

export const UiSpecSchema = z.discriminatedUnion('kind', [
  UiChoicesSchema,
  UiConfirmSchema,
  UiDiffSchema,
  UiFormSchema,
  UiVitestSchema,
])

export type UiFormField = z.infer<typeof UiFormFieldSchema>
export type UiFieldType = UiFormField['type']
export type UiSpec = z.infer<typeof UiSpecSchema>
export type UiChoices = z.infer<typeof UiChoicesSchema>
export type UiConfirm = z.infer<typeof UiConfirmSchema>
export type UiDiff = z.infer<typeof UiDiffSchema>
export type UiForm = z.infer<typeof UiFormSchema>
export type UiVitest = z.infer<typeof UiVitestSchema>

export const CONCIV_UI_EVENT = 'conciv-ui'

export function aguiCustomFor(spec: UiSpec): StreamChunk {
  return {type: EventType.CUSTOM, name: CONCIV_UI_EVENT, value: spec}
}

export const CONCIV_SNAPSHOT_EVENT = 'conciv-snapshot'

export const SnapshotSchema = z.object({generating: z.boolean(), messages: ChatHistorySchema})
export type Snapshot = z.infer<typeof SnapshotSchema>

export function aguiSnapshotFor(snapshot: Snapshot): StreamChunk {
  return {type: EventType.CUSTOM, name: CONCIV_SNAPSHOT_EVENT, value: snapshot}
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

export function parseUiSpec(input: unknown): UiSpec | null {
  const result = UiSpecSchema.safeParse(input)
  return result.success ? result.data : null
}

export function parseField(raw: string): UiFormField | null {
  const [name, label, type, opts] = raw.split(':')
  if (!name || !label) return null
  if (type !== 'text' && type !== 'select') return null
  if (type === 'select') {
    const options = (opts ?? '').split(',').filter(Boolean)
    if (options.length === 0) return null
    return {name, label, type, options}
  }
  return {name, label, type}
}

export type UiBuildInput = {
  kind: string
  question?: string
  detail?: string
  options?: string[]
  file?: string
  before?: string
  after?: string
  title?: string
  fields?: UiFormField[]
}

export function buildUiSpec(input: UiBuildInput, id: string): UiSpec {
  if (input.kind === 'choices') {
    if (!input.question) throw new Error('choices needs a question')
    if (!input.options?.length) throw new Error('choices needs at least one option')
    return {kind: 'choices', renderId: id, question: input.question, options: input.options}
  }
  if (input.kind === 'confirm') {
    if (!input.question) throw new Error('confirm needs a question')
    return {kind: 'confirm', renderId: id, question: input.question, detail: input.detail}
  }
  if (input.kind === 'diff') {
    if (input.file === undefined || input.before === undefined || input.after === undefined) {
      throw new Error('diff needs file, before, and after')
    }
    return {kind: 'diff', renderId: id, file: input.file, before: input.before, after: input.after}
  }
  if (input.kind === 'form') {
    if (!input.fields?.length) throw new Error('form needs at least one field')
    return {kind: 'form', renderId: id, title: input.title, fields: input.fields}
  }
  throw new Error(`unknown ui kind: ${input.kind}`)
}
