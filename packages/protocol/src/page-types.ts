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
  'find',
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
})

export type PageQuery = z.infer<typeof PageQuerySchema>

export const PageQueryInputSchema = PageQuerySchema.omit({kind: true, requestId: true})
export type PageQueryInput = z.infer<typeof PageQueryInputSchema>

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
