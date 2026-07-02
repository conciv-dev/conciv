import {z} from 'zod'

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
  is_error: z.boolean().optional(),
})

const CONCIV_MCP_PREFIX = 'mcp__conciv__'
export function canonicalToolName(name: string): string {
  return name.startsWith(CONCIV_MCP_PREFIX) ? name.slice(CONCIV_MCP_PREFIX.length) : name
}

const TextContentPart = z.object({type: z.literal('text'), text: z.string()})
export function contentText(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    const texts = raw.flatMap((p) => {
      const part = TextContentPart.safeParse(p)
      return part.success ? [part.data.text] : []
    })
    if (texts.length > 0) return texts.join('\n')
  }
  return JSON.stringify(raw ?? '')
}
