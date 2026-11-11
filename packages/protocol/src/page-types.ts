import {z} from 'zod'
import {PageCaptureBundleSchema} from './element-capture-types.js'
import {CODE_MODE_TIMEOUT_MS} from './chat-types.js'

export const PAGE_QUEUE_TOOL = 'page_queue'
export const PAGE_QUEUE_ASYNC_TOOL = 'page_queue_async'
export const PAGE_QUEUE_SYNC_MS = CODE_MODE_TIMEOUT_MS - 30_000
export const PAGE_QUEUE_MAX_ACTIONS = 50
export const PAGE_QUEUE_STOPPED = 'QUEUE_STOPPED'
export const PAGE_QUEUE_STOPPED_MESSAGE = 'stopped by the user before this action'

export const PageQueueSlotSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().min(-1),
  of: z.number().int().min(1),
})
export type PageQueueSlot = z.infer<typeof PageQueueSlotSchema>

export const PageQuerySchema = z.object({
  requestId: z.string().optional(),
  agentId: z.string().min(1).describe('the agent the page call acts for; keys its cursor on the page'),
  name: z.string().min(1).describe('registry tool name whose client body runs in the page'),
  input: z.record(z.string(), z.unknown()).describe('schema-validated input for the named tool'),
  mutating: z.boolean().optional().describe('an act call, played in turn behind a queue playing on the tab'),
  queue: z
    .object({id: z.string().min(1), replies: z.array(z.string().min(1)).min(1)})
    .optional()
    .describe('a page_queue call: the queue id and the request id each played action replies with'),
  queued: PageQueueSlotSchema.optional().describe('the queue slot this action plays in'),
})

export const PageQueueActionsSchema = z.object({actions: z.array(z.looseObject({tool: z.string().min(1)})).min(1)})

export type PageQuery = z.infer<typeof PageQuerySchema>

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
  z.object({
    ok: z.literal(true),
    result: z.record(z.string(), z.unknown()).default({}),
    capture: PageCaptureBundleSchema.optional(),
  }),
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

export const RawFrameSchema = z.object({
  fileName: z.string().optional(),
  line: z.number().optional(),
  column: z.number().optional(),
  fn: z.string().optional(),
})
export type RawFrame = z.infer<typeof RawFrameSchema>
export const OpenSourceSchema = z.object({frames: z.array(RawFrameSchema)})
export const SourceLocSchema = z.object({file: z.string(), line: z.number(), column: z.number()})
export type SourceLoc = z.infer<typeof SourceLocSchema>
export const SymbolicateFrameSchema = z.object({
  fileName: z.string().min(1),
  line: z.number().int().min(1),
  column: z.number().int().min(0).optional(),
})
export const SymbolicateSchema = z.object({frames: z.array(SymbolicateFrameSchema).min(1).max(32)})
export const OpenSourceResultSchema = z.object({status: z.enum(['opened', 'no-source', 'failed'])})
export type OpenSourceResult = z.infer<typeof OpenSourceResultSchema>['status']

export const PageQueueOutcomeSchema = z.discriminatedUnion('ok', [
  z.object({index: z.number().int(), tool: z.string(), ok: z.literal(true), result: z.record(z.string(), z.unknown())}),
  z.object({index: z.number().int(), tool: z.string(), ok: z.literal(false), error: z.string()}),
])
export type PageQueueOutcome = z.infer<typeof PageQueueOutcomeSchema>

export const PageQueueResultSchema = z.object({
  queueId: z.string(),
  status: z.enum(['finished', 'stopped', 'lost']),
  outcomes: z.array(PageQueueOutcomeSchema),
  failed: z.number().int(),
  played: z.number().int(),
})
export type PageQueueResult = z.infer<typeof PageQueueResultSchema>

export const PageQueueHandleSchema = z.object({queueId: z.string(), actions: z.number().int()})
export type PageQueueHandle = z.infer<typeof PageQueueHandleSchema>

export const PageQueueProgressSchema = z.object({
  queueId: z.string(),
  status: z.literal('playing'),
  done: z.number().int(),
  of: z.number().int(),
})
export type PageQueueProgress = z.infer<typeof PageQueueProgressSchema>
