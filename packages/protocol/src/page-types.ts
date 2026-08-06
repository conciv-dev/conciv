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
  'ext',
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
  name: z.string().optional().describe('React component name'),
  attribute: z.string().optional().describe('attribute name for setattr/removeattr/attr'),
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
  extension: z.string().optional().describe('extension name owning the verb (ext kind)'),
  verb: z.string().optional().describe('extension page verb name (ext kind)'),
  argsJson: z.string().optional().describe('JSON-encoded args for the ext verb'),
})

export type PageQuery = z.infer<typeof PageQuerySchema>

export const PageToolQuerySchema = z.object({
  requestId: z.string().optional(),
  kind: z.literal('tool'),
  name: z.string().min(1).describe('registry tool name whose client body runs in the page'),
  input: z.record(z.string(), z.unknown()).describe('schema-validated input for the named tool'),
  timeout: z.coerce.number().optional(),
})
export type PageToolQuery = z.infer<typeof PageToolQuerySchema>

export const PageWireQuerySchema = z.union([PageToolQuerySchema, PageQuerySchema])
export type PageWireQuery = z.infer<typeof PageWireQuerySchema>

export const PageQueryInputSchema = PageQuerySchema.omit({kind: true, requestId: true})
export type PageQueryInput = z.infer<typeof PageQueryInputSchema>

export const PAGE_REPORTED_ERROR_CODES = ['unknown-verb', 'invalid-args', 'handler-error'] as const
export const PAGE_TRANSPORT_ERROR_CODES = ['no-widget', 'timeout'] as const
export const PAGE_ERROR_CODES = [...PAGE_REPORTED_ERROR_CODES, ...PAGE_TRANSPORT_ERROR_CODES] as const
export type PageErrorCode = (typeof PAGE_ERROR_CODES)[number]
export type PageReportedErrorCode = (typeof PAGE_REPORTED_ERROR_CODES)[number]
const PageRaisedErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  data: z.unknown().optional(),
})
export type PageRaisedError = z.infer<typeof PageRaisedErrorSchema>

export const PageErrorSchema = z.object({
  code: z.enum(PAGE_REPORTED_ERROR_CODES),
  message: z.string(),
  raised: PageRaisedErrorSchema.optional(),
})
export type PageError = z.infer<typeof PageErrorSchema>

const PageOutcomeSchema = z.discriminatedUnion('ok', [
  z.object({ok: z.literal(true), result: z.record(z.string(), z.unknown()).default({})}),
  z.object({ok: z.literal(false), error: PageErrorSchema}),
])
export type PageOutcome = z.infer<typeof PageOutcomeSchema>

export type PageFailureError = {code: PageErrorCode; message: string; raised?: PageRaisedError}

export type PageFailure = Error & {readonly isPageFailure: true; error: PageFailureError}

export function pageFailure(code: PageErrorCode, message: string, raised?: PageRaisedError): PageFailure {
  const error: PageFailureError = raised === undefined ? {code, message} : {code, message, raised}
  return Object.assign(new Error(message), {isPageFailure: true as const, error})
}

export function isPageFailure(value: unknown): value is PageFailure {
  return value instanceof Error && 'isPageFailure' in value && value.isPageFailure === true
}

export const PageReplySchema = z.object({requestId: z.string(), outcome: PageOutcomeSchema})
export type PageReply = z.infer<typeof PageReplySchema>

export const PageRunInputSchema = PageQueryInputSchema.extend({verb: PageQueryKindSchema})
export type PageRunInput = z.infer<typeof PageRunInputSchema>

export const PageRunResultSchema = z.record(z.string(), z.unknown())

export const PageChangeEntrySchema = z.object({
  seq: z.number(),
  ts: z.number(),
  verb: z.string(),
  ref: z.string().optional(),
  selector: z.string().optional(),
  args: z.record(z.string(), z.unknown()),
})
export type PageChangeEntry = z.infer<typeof PageChangeEntrySchema>

export type PageResult = Record<string, unknown>

export function ok(data: Record<string, unknown> = {}): PageResult {
  return {ok: true, ...data}
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
export const SourceLocSchema = z.object({file: z.string(), line: z.number(), column: z.number()})
export const SymbolicateFrameSchema = z.object({
  fileName: z.string().min(1),
  line: z.number().int().min(1),
  column: z.number().int().min(0).optional(),
})
export const SymbolicateSchema = z.object({frames: z.array(SymbolicateFrameSchema).min(1).max(32)})
export const OpenSourceResultSchema = z.object({status: z.enum(['opened', 'no-source', 'failed'])})
export type OpenSourceResult = z.infer<typeof OpenSourceResultSchema>['status']
