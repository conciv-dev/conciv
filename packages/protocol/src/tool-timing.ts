import {z} from 'zod'
import {EventType, type StreamChunk} from '@tanstack/ai'

export const CONCIV_TOOL_DURATION_EVENT = 'conciv-tool-duration'

export const ToolDurationSchema = z.object({toolCallId: z.string(), durationMs: z.number()})
export type ToolDuration = z.infer<typeof ToolDurationSchema>

export function aguiToolDurationFor(toolCallId: string, durationMs: number): StreamChunk {
  return {type: EventType.CUSTOM, name: CONCIV_TOOL_DURATION_EVENT, value: {toolCallId, durationMs}}
}
