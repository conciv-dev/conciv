import type {z} from 'zod'
import beautify from 'js-beautify'
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

// Parse a tool result's payload as JSON (the harness already unwrapped the MCP content envelope at
// the decode boundary, so content is the clean payload text). Returns the parsed value, or undefined
// when it isn't JSON (e.g. plain prose / terminal output).
export function parseResultPayload(result: ToolResultPart | undefined): unknown {
  const text = resultText(result)
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
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

// Wall-clock for a tool call, formatted like the mockup's mono meta ("0.4s", "1.8s", "12s").
export function formatDuration(ms: number | undefined): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return undefined
  const s = ms / 1000
  return `${s.toFixed(s < 10 ? 1 : 0)}s`
}

// Pretty-print a serialized DOM string (the page `dom` read returns body.outerHTML as one unbroken
// line) into indented HTML so Pierre/Shiki renders it readably instead of as one endless row.
// Display-only — the wire payload stays raw. Uses js-beautify (VS Code's HTML formatter); raw-text
// element bodies (script/style) are preserved. Falls back to the input if beautify throws.
export function formatHtml(src: string): string {
  try {
    return beautify.html(src, {indent_size: 2, wrap_line_length: 0, preserve_newlines: false})
  } catch {
    return src
  }
}

export type ToolGlyph = 'spin' | 'done' | 'error'

// The lifecycle glyph for a tool call. Per the tanstack state model the call part settles at
// 'input-complete' (never 'complete'); completion shows on the sibling tool-result, whose state the
// StreamProcessor sets to 'complete' or 'error' (from the harness's ToolOutputState), and/or via a
// populated part.output. So: error wins, else done once a result/output is present, else running.
export function toolGlyph(part: ToolCallPart, result: ToolResultPart | undefined): ToolGlyph {
  if (result?.state === 'error') return 'error'
  if (result?.state === 'complete' || part.output !== undefined) return 'done'
  return 'spin'
}
