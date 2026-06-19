import {z} from 'zod'

// The single source of truth for the page-bus contract, shared by core (server) and the
// widget (browser). The kind union is derived from a runtime array so a contract test can
// assert the verb table + handler registry never drift from it.
export const PAGE_QUERY_KINDS = [
  'route',
  'dom',
  'query',
  'console',
  'text',
  'value',
  'attr',
  'exists',
  'snapshot',
  'locate',
  'tree',
  'inspect',
  'override',
  'find',
  'track',
  'wait',
  'click',
  'fill',
  'select',
  'check',
  'uncheck',
  'press',
  'hover',
  'scroll',
  'submit',
  'setattr',
  'removeattr',
  'addclass',
  'removeclass',
  'setstyle',
  'settext',
  'sethtml',
  'remove',
  'insert',
  'css',
  'eval',
] as const

export type PageQueryKind = (typeof PAGE_QUERY_KINDS)[number]

export const MUTATING_KINDS = [
  'override',
  'click',
  'fill',
  'select',
  'check',
  'uncheck',
  'press',
  'hover',
  'scroll',
  'submit',
  'setattr',
  'removeattr',
  'addclass',
  'removeclass',
  'setstyle',
  'settext',
  'sethtml',
  'remove',
  'insert',
  'css',
  'eval',
] as const satisfies readonly PageQueryKind[]

// Visual action verbs that move/affect a visible element — the ones worth mirroring on the real page
// (cursor glide + ring) and flagging in the tool card. Shared so the widget's page-mirror and the
// tool-ui card never drift on which actions claim "shown on your page". Non-visual reads are excluded.
export const MIRROR_KINDS = [
  'click',
  'fill',
  'select',
  'check',
  'uncheck',
  'press',
  'hover',
  'scroll',
  'submit',
] as const satisfies readonly PageQueryKind[]

export function mirrorsKind(kind: PageQueryKind): boolean {
  return (MIRROR_KINDS as readonly PageQueryKind[]).includes(kind)
}

export const PageQueryKindSchema = z.enum(PAGE_QUERY_KINDS)
export const PagePositionSchema = z.enum(['before', 'after', 'prepend', 'append'])
export const PageWaitStateSchema = z.enum(['visible', 'hidden'])

export type PagePosition = z.infer<typeof PagePositionSchema>
export type PageWaitState = z.infer<typeof PageWaitStateSchema>

export const PageQuerySchema = z.object({
  requestId: z.string().optional(),
  kind: PageQueryKindSchema,
  selector: z.string().optional(),
  ref: z.string().optional(),
  since: z.coerce.number().optional(),
  value: z.string().optional(),
  name: z.string().optional(),
  class: z.string().optional(),
  prop: z.string().optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  key: z.string().optional(),
  position: PagePositionSchema.optional(),
  state: PageWaitStateSchema.optional(),
  timeout: z.coerce.number().optional(),
  code: z.string().optional(),
  // Dot-path into an inspect result for drill-down, e.g. "props.user.address" or "hooks.0.value".
  // Numeric segments index arrays. Stays a plain string so it rides the query-string + MCP alike.
  path: z.string().optional(),
  // override verb: which slice to edit, the hook id (from inspect's hooks tree), and the new value
  // as a JSON-encoded string (so `42`, `"text"`, `{"a":1}` are unambiguous over query-string + MCP).
  target: z.enum(['props', 'state', 'hooks', 'context']).optional(),
  hookId: z.coerce.number().optional(),
  json: z.string().optional(),
  // track verb: start a recording, stop it, or read the current report (filter by `name`).
  action: z.enum(['start', 'stop', 'report']).optional(),
})

export type PageQuery = z.infer<typeof PageQuerySchema>

export const PageQueryInputSchema = PageQuerySchema.omit({kind: true, requestId: true})
export type PageQueryInput = z.infer<typeof PageQueryInputSchema>

// POST /api/page/reply body — the widget's answer to a pushed PageQuery. Shared by core (validation)
// and the widget transport (typing) so the two ends can't drift.
export const PageReplySchema = z.object({requestId: z.string(), data: z.record(z.string(), z.unknown()).default({})})
export type PageReply = z.infer<typeof PageReplySchema>

// A reply is always a plain JSON object: either an error or some data (often {ok:true}).
export type PageResult = Record<string, unknown>

export function ok(data: Record<string, unknown> = {}): PageResult {
  return {ok: true, ...data}
}
export function err(message: string): PageResult {
  return {error: message}
}
export function isError(result: PageResult): boolean {
  return typeof result.error === 'string'
}

const MUTATING = new Set<string>(MUTATING_KINDS)
export function isMutating(kind: string): boolean {
  return MUTATING.has(kind)
}
