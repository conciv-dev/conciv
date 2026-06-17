import type {z} from 'zod'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'

// Typed, validated view of a tool call's streamed input. Returns undefined while args stream in or
// fail to validate, so cards show a title/spinner rather than crash on partial input. The result is
// typed to the concrete schema at each call site — no cast.
export function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  part: ToolCallPart,
): z.infer<TSchema> | undefined {
  const parsed = schema.safeParse(part.input)
  return parsed.success ? parsed.data : undefined
}

// The textual content of a tool result (results carry either a string or content parts).
export function resultText(result: ToolResultPart | undefined): string {
  if (!result) return ''
  return typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)
}

export type ToolGlyph = 'spin' | 'done' | 'error'

// The lifecycle glyph for a tool call. Per the tanstack state model a finished call settles at
// 'input-complete' (never 'complete'); completion shows as a populated part.output and/or a sibling
// tool-result whose state is 'complete'/'error'. So: error wins, else done once a result/output is
// present, else still running.
export function toolGlyph(part: ToolCallPart, result: ToolResultPart | undefined): ToolGlyph {
  if (result?.state === 'error') return 'error'
  if (result?.state === 'complete' || part.output !== undefined) return 'done'
  return 'spin'
}
