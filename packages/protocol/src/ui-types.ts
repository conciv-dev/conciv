import {EventType, type StreamChunk} from '@tanstack/ai'

// Generative-UI specs the chat agent emits via `devgent ui …`. Each spec is rendered as a
// real component in the chat thread (a React island in the widget). The agent does NOT
// block waiting for the answer — interactive components send the user's response as the
// next chat message, so the normal `claude --resume` turn cycle is the return path. Specs
// are carried to the widget as an AG-UI CUSTOM event (`devgent-ui`), the documented
// mechanism for client-driven UI — no invented wire format.

export type UiFieldType = 'text' | 'select'

export type UiFormField = {
  name: string
  label: string
  type: UiFieldType
  options?: string[]
}

export type UiChoices = {kind: 'choices'; renderId: string; question: string; options: string[]}
export type UiConfirm = {kind: 'confirm'; renderId: string; question: string; detail?: string}
export type UiDiff = {kind: 'diff'; renderId: string; file: string; before: string; after: string}
export type UiForm = {kind: 'form'; renderId: string; title?: string; fields: UiFormField[]}
// Emitted internally by the risky-Bash gate (NOT by the `devgent ui` CLI). The widget
// answers it via POST /__pw/chat/permission-decision (a blocking allow/deny that unblocks
// the PreToolUse hook), unlike the other kinds whose answer is the user's next chat message.
export type UiApproval = {kind: 'approval'; renderId: string; question: string; detail?: string}
// A persistent vitest results card, injected by the vitest route (NOT the `devgent ui` CLI).
// The widget subscribes to /__pw/vitest/stream for live deltas keyed by renderId.
export type UiVitest = {kind: 'vitest'; renderId: string}

export type UiSpec = UiChoices | UiConfirm | UiDiff | UiForm | UiApproval | UiVitest

// The CUSTOM event name the widget listens for via useChat({onCustomEvent}).
export const DEVGENT_UI_EVENT = 'devgent-ui'

// Wrap a spec as the AG-UI CUSTOM StreamChunk injected into the live chat stream.
export function aguiCustomFor(spec: UiSpec): StreamChunk {
  return {type: EventType.CUSTOM, name: DEVGENT_UI_EVENT, value: spec}
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function isFormField(v: unknown): v is UiFormField {
  if (typeof v !== 'object' || v === null) return false
  const f = v as Record<string, unknown>
  if (typeof f.name !== 'string' || typeof f.label !== 'string') return false
  if (f.type !== 'text' && f.type !== 'select') return false
  return f.options === undefined || isStringArray(f.options)
}

// Validate an untrusted spec (from the `devgent ui` POST body). Returns the typed spec or
// null — the route 400s on null rather than injecting a malformed component.
export function parseUiSpec(input: unknown): UiSpec | null {
  if (typeof input !== 'object' || input === null) return null
  const s = input as Record<string, unknown>
  if (typeof s.renderId !== 'string' || s.renderId === '') return null
  if (s.kind === 'choices') {
    if (typeof s.question !== 'string' || !isStringArray(s.options) || s.options.length === 0) return null
    return {kind: 'choices', renderId: s.renderId, question: s.question, options: s.options}
  }
  if (s.kind === 'confirm') {
    if (typeof s.question !== 'string') return null
    const detail = typeof s.detail === 'string' ? s.detail : undefined
    return {kind: 'confirm', renderId: s.renderId, question: s.question, detail}
  }
  if (s.kind === 'diff') {
    if (typeof s.file !== 'string' || typeof s.before !== 'string' || typeof s.after !== 'string') return null
    return {kind: 'diff', renderId: s.renderId, file: s.file, before: s.before, after: s.after}
  }
  if (s.kind === 'form') {
    if (!Array.isArray(s.fields) || !s.fields.every(isFormField) || s.fields.length === 0) return null
    const title = typeof s.title === 'string' ? s.title : undefined
    return {kind: 'form', renderId: s.renderId, title, fields: s.fields}
  }
  if (s.kind === 'vitest') return {kind: 'vitest', renderId: s.renderId}
  return null
}
