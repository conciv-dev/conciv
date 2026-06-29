import type {z} from 'zod'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'

// Typed, validated view of a tool call's input. The installed StreamProcessor exposes a call's args
// as the raw `part.arguments` JSON string and does NOT populate a `part.input` object on the public
// part ([[tanstack-part-input-empty]]), so resolve input the documented way: prefer `part.input` if a
// path ever sets it, else parse `part.arguments`. Returns undefined while args still stream (partial
// JSON) so cards show a title/spinner, never crash. Typed to the concrete schema — no cast.
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
      return undefined
    }
  }
  return undefined
}

// The textual content of a tool result (results carry either a string or content parts).
export function resultText(result: ToolResultPart | undefined): string {
  if (!result) return ''
  return typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)
}

// Parse a tool result's payload as JSON (the harness already unwrapped the MCP content envelope at
// the decode boundary). Returns the parsed value, or undefined when it isn't JSON.
export function parseResultPayload(result: ToolResultPart | undefined): unknown {
  const text = resultText(result)
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// Strip claude Read's per-line number prefix ("<lineno>\t<content>") so the code block highlights real
// source and @pierre/diffs' own gutter isn't duplicated by the leaked numbers.
export function stripReadLineNumbers(raw: string): string {
  if (!raw) return ''
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*\d+\t/, ''))
    .join('\n')
}

// Wall-clock for a tool call, formatted like the mockup's mono meta ("0.4s", "1.8s", "12s").
export function formatDuration(ms: number | undefined): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return undefined
  const s = ms / 1000
  return `${s.toFixed(s < 10 ? 1 : 0)}s`
}
