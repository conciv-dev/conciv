import {z} from 'zod'
import {EventType, type CustomEvent, type StreamChunk} from '@tanstack/ai'
import type {ToolCallPart} from './chat-message-types.js'

export type ChatEvent = StreamChunk

export type ChatCustomEvent = CustomEvent

export const ChatEventType = EventType

export {CONTEXT_OVERFLOW_CODE} from '@tanstack/ai'

export const SESSION_DELETED_CODE = 'session_deleted'

export type ChatEventDefinition<Name extends string, Schema extends z.ZodType> = {
  name: Name
  create: (value: z.input<Schema>) => ChatCustomEvent
  parse: (event: ChatEvent) => z.output<Schema> | null
  read: (eventName: string, value: unknown) => z.output<Schema> | null
}

export function defineChatEvent<Name extends string, Schema extends z.ZodType>(
  name: Name,
  schema: Schema,
): ChatEventDefinition<Name, Schema> {
  const read = (eventName: string, value: unknown): z.output<Schema> | null => {
    if (eventName !== name) return null
    const parsed = schema.safeParse(value)
    return parsed.success ? parsed.data : null
  }
  return {
    name,
    create: (value) => ({type: EventType.CUSTOM, name, value: schema.parse(value)}),
    parse: (event) => (event.type === EventType.CUSTOM ? read(event.name, event.value) : null),
    read,
  }
}

const ToolCallTimeSchema = z.object({start: z.number().optional(), end: z.number().optional()})

export type ToolCallTime = z.infer<typeof ToolCallTimeSchema>

const ToolCallTimeMetadataSchema = z.looseObject({time: ToolCallTimeSchema})

function readTime(metadata: unknown): ToolCallTime | undefined {
  return ToolCallTimeMetadataSchema.safeParse(metadata).data?.time
}

export function readToolCallTime(part: ToolCallPart): ToolCallTime | undefined {
  const called = readTime(part.metadata)
  const resulted = readTime(part.resultMetadata)
  if (called === undefined && resulted === undefined) return undefined
  return {...called, ...resulted}
}

export function toolCallDuration(part: ToolCallPart): number | undefined {
  const time = readToolCallTime(part)
  if (time?.start === undefined || time.end === undefined) return undefined
  return time.end - time.start
}

export const approvalRequestedEvent = defineChatEvent(
  'approval-requested',
  z.looseObject({
    approvalId: z.string().min(1),
    title: z.string().min(1),
    toolCallId: z.string().min(1).optional(),
    permission: z.object({always: z.boolean()}).optional(),
  }),
)

const ApprovalAskSchema = z.object({
  approvalId: z.string().min(1),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  input: z.unknown(),
  permission: z.object({always: z.boolean()}).optional(),
})

export type ApprovalAsk = z.infer<typeof ApprovalAskSchema>

export function readApprovalAsk(event: ChatEvent): ApprovalAsk | null {
  const value = approvalRequestedEvent.parse(event)
  if (value === null) return null
  const {approvalId, title, toolCallId, permission, ...detail} = value
  const ask = {
    approvalId,
    toolCallId: toolCallId ?? approvalId,
    toolName: title,
    input: 'input' in detail ? detail.input : detail,
  }
  return permission === undefined ? ask : {...ask, permission}
}

export const approvalSettledEvent = defineChatEvent('approval-settled', z.object({approvalId: z.string().min(1)}))

export function readApprovalSettled(event: ChatEvent): string | null {
  return approvalSettledEvent.parse(event)?.approvalId ?? null
}

export type RunStatus = 'running' | 'interrupted' | 'completed' | 'failed' | 'aborted'

const RunPhaseSchema = z.enum(['running', 'stopping', 'completed', 'failed', 'aborted'])

export type RunPhase = z.infer<typeof RunPhaseSchema>

export const RunLifecycleSchema = z.object({
  runId: z.string().min(1),
  phase: RunPhaseSchema,
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  serverNow: z.number(),
  error: z.string().nullable(),
})

export type RunLifecycle = z.infer<typeof RunLifecycleSchema>

export type RunClockSource = {lifecycle: RunLifecycle; receivedAt: number}

export const runLifecycleEvent = defineChatEvent('conciv.run-lifecycle', RunLifecycleSchema)

export const sessionRunEvent = defineChatEvent('conciv.session-run', z.object({runId: z.string().min(1)}))

export const idleFailedEvent = defineChatEvent('conciv.idle-failed', z.object({runId: z.string().min(1)}))

export const codeModeCallEvent = defineChatEvent(
  'conciv.code-mode-call',
  z.looseObject({callId: z.string().min(1), function: z.string(), args: z.unknown()}),
)

export const codeModeResultEvent = defineChatEvent(
  'conciv.code-mode-result',
  z.looseObject({callId: z.string().min(1), result: z.unknown()}),
)

export const codeModeErrorEvent = defineChatEvent(
  'conciv.code-mode-error',
  z.looseObject({callId: z.string().min(1), error: z.string(), outcome: z.literal('denied').optional()}),
)

export function isRunPhaseTerminal(phase: RunPhase): boolean {
  return phase === 'completed' || phase === 'failed' || phase === 'aborted'
}
