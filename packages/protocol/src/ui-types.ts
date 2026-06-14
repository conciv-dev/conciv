import {z} from 'zod'
import {EventType, type StreamChunk} from '@tanstack/ai'

// Generative-UI specs the chat agent emits via `aidx ui …`, rendered as components in the
// chat thread and carried to the widget as an AG-UI CUSTOM event. The schemas are the contract;
// types are inferred from them.

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
// Emitted by the risky-Bash gate; answered via POST /api/chat/permission-decision (blocking).
export const UiApprovalSchema = z.object({
  kind: z.literal('approval'),
  renderId,
  question: z.string(),
  detail: z.string().optional(),
})
// Test-results card injected by the test route. (Kind stays 'vitest' until Plan 3.)
export const UiVitestSchema = z.object({kind: z.literal('vitest'), renderId})

export const UiSpecSchema = z.discriminatedUnion('kind', [
  UiChoicesSchema,
  UiConfirmSchema,
  UiDiffSchema,
  UiFormSchema,
  UiApprovalSchema,
  UiVitestSchema,
])

export type UiFormField = z.infer<typeof UiFormFieldSchema>
export type UiFieldType = UiFormField['type']
export type UiSpec = z.infer<typeof UiSpecSchema>
export type UiChoices = z.infer<typeof UiChoicesSchema>
export type UiConfirm = z.infer<typeof UiConfirmSchema>
export type UiDiff = z.infer<typeof UiDiffSchema>
export type UiForm = z.infer<typeof UiFormSchema>
export type UiApproval = z.infer<typeof UiApprovalSchema>
export type UiVitest = z.infer<typeof UiVitestSchema>

// The CUSTOM event name the widget listens for via useChat({onCustomEvent}).
export const AIDX_UI_EVENT = 'aidx-ui'

// Wrap a spec as the AG-UI CUSTOM StreamChunk injected into the live chat stream.
export function aguiCustomFor(spec: UiSpec): StreamChunk {
  return {type: EventType.CUSTOM, name: AIDX_UI_EVENT, value: spec}
}

// For non-h3 callers; route handlers use readValidatedBody(event, UiSpecSchema) directly.
export function parseUiSpec(input: unknown): UiSpec | null {
  const result = UiSpecSchema.safeParse(input)
  return result.success ? result.data : null
}

// Parse a CLI form-field spec `name:label:type[:opt1,opt2]` into a typed field. null if malformed.
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

// Normalized builder input — shared by the CLI (`aidx ui`) and the aidx_ui MCP tool. Both
// normalize their own raw args to this shape, then call buildUiSpec.
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

// Pure: normalized input + a caller-supplied renderId → a typed UiSpec. Throws on invalid input.
export function buildUiSpec(input: UiBuildInput, renderId: string): UiSpec {
  if (input.kind === 'choices') {
    if (!input.question) throw new Error('choices needs a question')
    if (!input.options?.length) throw new Error('choices needs at least one option')
    return {kind: 'choices', renderId, question: input.question, options: input.options}
  }
  if (input.kind === 'confirm') {
    if (!input.question) throw new Error('confirm needs a question')
    return {kind: 'confirm', renderId, question: input.question, detail: input.detail}
  }
  if (input.kind === 'diff') {
    if (input.file === undefined || input.before === undefined || input.after === undefined) {
      throw new Error('diff needs file, before, and after')
    }
    return {kind: 'diff', renderId, file: input.file, before: input.before, after: input.after}
  }
  if (input.kind === 'form') {
    if (!input.fields?.length) throw new Error('form needs at least one field')
    return {kind: 'form', renderId, title: input.title, fields: input.fields}
  }
  throw new Error(`unknown ui kind: ${input.kind}`)
}
