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
  is_error: z.boolean().optional(),
})

// Claude namespaces MCP tools as `mcp__<server>__<tool>`. Our own tools ride the `mandarax` server
// (see claude/args.ts allowlist), so un-prefix them back to the canonical name (mandarax_page, …)
// the rest of the stack decided on. Third-party MCP tools keep their prefixed name and hit the
// generic card. Applied at every boundary that surfaces a tool name: live decode + transcript parse.
const MANDARAX_MCP_PREFIX = 'mcp__mandarax__'
export function canonicalToolName(name: string): string {
  return name.startsWith(MANDARAX_MCP_PREFIX) ? name.slice(MANDARAX_MCP_PREFIX.length) : name
}

// A tool_result's content reaches us as either a plain string (claude built-ins like Bash) or an MCP
// content-part array `[{type:'text',text}, …]` (our MCP tools — see core/api/mcp wrapping the payload
// in {content:[{type:'text',text:JSON.stringify(result)}]}). Unwrap text parts back to their text so
// the UI gets the clean payload, never the escaped `[{"type":"text",...}]` array. Non-text parts
// (e.g. ToolSearch's tool_reference) have no text, so they keep their JSON form. Shared by the live
// decoder and the transcript parser so both paths surface results identically.
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
