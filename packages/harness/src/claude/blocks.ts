import {z} from 'zod'

// Claude content blocks, shared by the live stream decoder and the transcript parser.
export const TextBlock = z.object({type: z.literal('text'), text: z.string()})
export const ThinkingBlock = z.object({type: z.literal('thinking'), thinking: z.string()})
export const ToolUseBlock = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.unknown().optional(),
})
export const ToolResultBlock = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  content: z.unknown().optional(),
})
