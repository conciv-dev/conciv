import type {z} from 'zod'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'

// Typed, validated view of a tool call's input — the tanstack convention (render from the part,
// reading its typed input). The installed StreamProcessor exposes a call's args as the raw
// `part.arguments` JSON string and does NOT populate a `part.input` object on the public part
// (updateToolCallPart/completeToolCall only ever write `arguments`), so we resolve input the
// documented way: prefer `part.input` if a path ever sets it, else parse `part.arguments`. Returns
// undefined while args still stream (partial/invalid JSON) so cards show a title/spinner, never crash.
// Typed to the concrete schema at each call site — no cast.
export function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  part: ToolCallPart,
): z.infer<TSchema> | undefined {
  const direct = schema.safeParse(part.input)
  if (direct.success) return direct.data
  if (typeof part.arguments === 'string' && part.arguments.length > 0) {
    try {
      const fromArgs = schema.safeParse(JSON.parse(part.arguments))
      if (fromArgs.success) return fromArgs.data
    } catch {
      // args not yet valid JSON — still streaming
    }
  }
  return undefined
}

// The textual content of a tool result (results carry either a string or content parts).
export function resultText(result: ToolResultPart | undefined): string {
  if (!result) return ''
  return typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)
}

// Strip claude Read's per-line number prefix so the code block highlights real source and @pierre's
// own gutter isn't duplicated by the leaked numbers. claude's real format is "<lineno>\t<content>"
// (optional leading pad, then a TAB) — verified against claude 2.x stream-json.
export function stripReadLineNumbers(raw: string): string {
  if (!raw) return ''
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*\d+\t/, ''))
    .join('\n')
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
