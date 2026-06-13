import {z} from 'zod'
import {EventType, type StreamChunk} from '@tanstack/ai'

// Generative-UI specs the chat agent emits via `devgent ui …`. Each spec is rendered as a
// real component in the chat thread (a React island in the widget). The agent does NOT block
// waiting for the answer — interactive components send the user's response as the next chat
// message, so the normal `--resume` turn cycle is the return path. Specs are carried to the
// widget as an AG-UI CUSTOM event (`devgent-ui`).
//
// The Zod schemas below ARE the contract: the `devgent ui` POST body is validated with
// UiSpecSchema (h3 readValidatedBody), and the TypeScript types are inferred from the schemas —
// one source of truth, no hand-rolled guards, no casts.

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
// Emitted internally by the risky-Bash gate (NOT by the `devgent ui` CLI). The widget answers
// it via POST /api/chat/permission-decision (a blocking allow/deny that unblocks the PreToolUse
// hook), unlike the other kinds whose answer is the user's next chat message.
export const UiApprovalSchema = z.object({
  kind: z.literal('approval'),
  renderId,
  question: z.string(),
  detail: z.string().optional(),
})
// A persistent test-results card, injected by the test route (NOT the `devgent ui` CLI). The
// widget subscribes to the test stream for live deltas keyed by renderId. (Kind kept as
// 'vitest' until Plan 3 generalizes the widget card to all runners.)
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
export const DEVGENT_UI_EVENT = 'devgent-ui'

// Wrap a spec as the AG-UI CUSTOM StreamChunk injected into the live chat stream.
export function aguiCustomFor(spec: UiSpec): StreamChunk {
  return {type: EventType.CUSTOM, name: DEVGENT_UI_EVENT, value: spec}
}

// Validate an untrusted spec (e.g. a non-h3 caller). Returns the typed spec or null. Route
// handlers should prefer h3's readValidatedBody(event, UiSpecSchema) for the auto-400.
export function parseUiSpec(input: unknown): UiSpec | null {
  const result = UiSpecSchema.safeParse(input)
  return result.success ? result.data : null
}
