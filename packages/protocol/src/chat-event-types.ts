import {z} from 'zod'
import {PageQueueResultSchema} from './page-types.js'
import {EventType, type CustomEvent, type StreamChunk} from '@tanstack/ai'

export type ChatEvent = StreamChunk

export type ChatCustomEvent = CustomEvent

export const ChatEventType = EventType

export {CONTEXT_OVERFLOW_CODE} from '@tanstack/ai'

export type ChatEventDefinition<Name extends string, Schema extends z.ZodType> = {
  name: Name
  create: (value: z.input<Schema>) => ChatCustomEvent
  parse: (event: ChatEvent) => z.output<Schema> | null
}

export function defineChatEvent<Name extends string, Schema extends z.ZodType>(
  name: Name,
  schema: Schema,
): ChatEventDefinition<Name, Schema> {
  return {
    name,
    create: (value) => ({type: EventType.CUSTOM, name, value: schema.parse(value)}),
    parse: (event) => {
      if (event.type !== EventType.CUSTOM || event.name !== name) return null
      const parsed = schema.safeParse(event.value)
      return parsed.success ? parsed.data : null
    },
  }
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

export function approvalAskOf(event: ChatEvent): ApprovalAsk | null {
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

export function approvalSettledOf(event: ChatEvent): string | null {
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
  z.looseObject({callId: z.string().min(1), error: z.string()}),
)

export const pageQueueEvent = defineChatEvent(
  'conciv.page-queue',
  PageQueueResultSchema.extend({toolCallId: z.string().min(1).optional()}),
)

export function isRunPhaseTerminal(phase: RunPhase): boolean {
  return phase === 'completed' || phase === 'failed' || phase === 'aborted'
}
