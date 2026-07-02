import type {z} from 'zod'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'

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

export function resultText(result: ToolResultPart | undefined): string {
  if (!result) return ''
  return typeof result.content === 'string' ? result.content : JSON.stringify(result.content, null, 2)
}

export function parseResultPayload(result: ToolResultPart | undefined): unknown {
  const text = resultText(result)
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function stripReadLineNumbers(raw: string): string {
  if (!raw) return ''
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*\d+\t/, ''))
    .join('\n')
}

export function formatDuration(ms: number | undefined): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return undefined
  const s = ms / 1000
  return `${s.toFixed(s < 10 ? 1 : 0)}s`
}
