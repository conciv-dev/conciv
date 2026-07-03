import {z} from 'zod'

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
  'effect',
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
  selector: z.string().optional().describe('CSS selector for the target element'),
  ref: z.string().optional().describe('element ref from the latest snapshot'),
  since: z.coerce.number().optional(),
  value: z
    .string()
    .optional()
    .describe('the value to set: input value for fill/select, CSS value for setstyle, attribute value for setattr'),
  name: z.string().optional().describe('attribute name for setattr/removeattr/attr, or React component name'),
  class: z.string().optional().describe('class name for addclass/removeclass'),
  prop: z.string().optional().describe('CSS property name for setstyle, e.g. color or font-size'),
  text: z.string().optional().describe('text for settext, or the full stylesheet string for css'),
  html: z.string().optional().describe('HTML fragment for sethtml/insert'),
  key: z.string().optional().describe('keyboard key for press, e.g. Enter'),
  position: PagePositionSchema.optional(),
  state: PageWaitStateSchema.optional(),
  timeout: z.coerce.number().optional(),
  code: z.string().optional(),

  path: z.string().optional(),

  target: z.enum(['props', 'state', 'hooks', 'context']).optional(),
  hookId: z.coerce.number().optional(),
  json: z.string().optional(),
  effect: z.string().optional(),
  action: z.enum(['start', 'stop', 'report', 'enable', 'disable', 'toggle', 'list']).optional(),
})

export type PageQuery = z.infer<typeof PageQuerySchema>

export const PageQueryInputSchema = PageQuerySchema.omit({kind: true, requestId: true})
export type PageQueryInput = z.infer<typeof PageQueryInputSchema>

export const PageReplySchema = z.object({requestId: z.string(), data: z.record(z.string(), z.unknown()).default({})})
export type PageReply = z.infer<typeof PageReplySchema>

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

export const RawFrameSchema = z.object({
  fileName: z.string().optional(),
  line: z.number().optional(),
  column: z.number().optional(),
  fn: z.string().optional(),
})
export const OpenSourceSchema = z.object({frames: z.array(RawFrameSchema)})
export const OpenSourceResultSchema = z.object({status: z.enum(['opened', 'no-source', 'failed'])})
export type OpenSourceResult = z.infer<typeof OpenSourceResultSchema>['status']
