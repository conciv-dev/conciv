import {z} from 'zod'
import {EventType, type CustomEvent, type StreamChunk} from '@tanstack/ai'

export type ChatEvent = StreamChunk

export type ChatCustomEvent = CustomEvent

export const ChatEventType = EventType

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
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    input: z.unknown(),
    approval: z.looseObject({id: z.string().min(1), needsApproval: z.boolean().optional()}),
  }),
)

export const approvalSettledEvent = defineChatEvent(
  'conciv.approval-settled',
  z.looseObject({approvalId: z.string().min(1)}),
)

export const ApprovalAskSchema = z.object({
  approvalId: z.string().min(1),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  input: z.unknown(),
})

export type ApprovalAsk = z.infer<typeof ApprovalAskSchema>

export function approvalAskOf(event: ChatEvent): ApprovalAsk | null {
  const value = approvalRequestedEvent.parse(event)
  if (value === null) return null
  return {approvalId: value.approval.id, toolCallId: value.toolCallId, toolName: value.toolName, input: value.input}
}

export const RunPhaseSchema = z.enum(['running', 'stopping', 'completed', 'failed', 'aborted'])

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

export function isRunPhaseTerminal(phase: RunPhase): boolean {
  return phase === 'completed' || phase === 'failed' || phase === 'aborted'
}

export const codeModeToolCallEvent = defineChatEvent(
  'conciv:tool_call',
  z.object({callId: z.string(), name: z.string(), input: z.unknown(), toolCallId: z.string().optional()}),
)

export const codeModeToolResultEvent = defineChatEvent(
  'conciv:tool_result',
  z.object({callId: z.string(), result: z.unknown()}),
)

export const codeModeToolErrorEvent = defineChatEvent(
  'conciv:tool_error',
  z.object({callId: z.string(), error: z.string()}),
)
