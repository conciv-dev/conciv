import {z} from 'zod'
import {CODE_MODE_TIMEOUT_MS} from './chat-types.js'

export const PLUGIN_OVERLAY_ATTR = 'data-conciv-overlay'

export const CONCIV_UI_SELECTOR = `[data-conciv-root], [${PLUGIN_OVERLAY_ATTR}], [data-conciv-fonts], [data-conciv-properties], [data-conciv-toast]`

export const PAGE_QUEUE_ASYNC_TOOL = 'page_queue_async'
export const PAGE_QUEUE_SYNC_MS = CODE_MODE_TIMEOUT_MS - 30_000
export const PAGE_QUEUE_MAX_ACTIONS = 50
export const PAGE_QUEUE_STOPPED = 'QUEUE_STOPPED'
export const PAGE_QUEUE_REFUSED = 'QUEUE_REFUSED'
export const PAGE_QUEUE_STOPPED_MESSAGE = 'stopped by the user before this action'

export const PAGE_REPORTED_ERROR_CODES = ['unknown-verb', 'invalid-args', 'handler-error'] as const
export const PAGE_TRANSPORT_ERROR_CODES = ['no-widget', 'timeout'] as const
export const PAGE_ERROR_CODES = [...PAGE_REPORTED_ERROR_CODES, ...PAGE_TRANSPORT_ERROR_CODES] as const
export type PageErrorCode = (typeof PAGE_ERROR_CODES)[number]
export const PageRaisedErrorSchema = z.object({
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

export type PageFailureError = {code: PageErrorCode; message: string; raised?: PageRaisedError}

export type PageFailure = Error & {readonly isPageFailure: true; error: PageFailureError}

export function pageFailure(code: PageErrorCode, message: string, raised?: PageRaisedError): PageFailure {
  const error: PageFailureError = raised === undefined ? {code, message} : {code, message, raised}
  return Object.assign(new Error(message), {isPageFailure: true as const, error})
}

export function isPageFailure(value: unknown): value is PageFailure {
  return value instanceof Error && 'isPageFailure' in value && value.isPageFailure === true
}

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
