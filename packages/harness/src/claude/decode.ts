import {z} from 'zod'
import type {StreamChunk} from '@tanstack/ai'
import type {HarnessDecodeOpts} from '@aidx/protocol/harness-types'
import {TextBlock, ThinkingBlock, ToolUseBlock, ToolResultBlock} from './blocks.js'
import {runAgui, textMessage, reasoningMessage, toolCall, toolResult, type Mint, type StepContext} from '../_shared/agui.js'

// Translate Claude's `--output-format stream-json` NDJSON into the AG-UI StreamChunk stream.
// Only the event schema + the event→chunks mapping are claude-specific; the run lifecycle, line
// loop, and chunk emitters live in ../_shared/agui.ts.

const ClaudeEventSchema = z
  .object({
    type: z.string(),
    session_id: z.string().optional(),
    message: z
      .object({content: z.array(z.unknown()).optional()})
      .loose()
      .optional(),
  })
  .loose()
type ClaudeEvent = z.infer<typeof ClaudeEventSchema>

// Emit the AG-UI chunks for one Claude assistant content block (validated per-block).
function* blockChunks(part: unknown, mint: Mint): Generator<StreamChunk> {
  const text = TextBlock.safeParse(part)
  if (text.success) return yield* textMessage(mint('m'), text.data.text)
  const thinking = ThinkingBlock.safeParse(part)
  if (thinking.success) return yield* reasoningMessage(mint('t'), thinking.data.thinking)
  const tool = ToolUseBlock.safeParse(part)
  if (tool.success) yield* toolCall(tool.data.id, tool.data.name, tool.data.input)
}

// Emit a tool result for each tool_result block in a Claude `user` event.
function* toolResultChunks(content: unknown, mint: Mint): Generator<StreamChunk> {
  if (!Array.isArray(content)) return
  for (const part of content) {
    const result = ToolResultBlock.safeParse(part)
    if (!result.success) continue
    const raw = result.data.content
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '')
    yield* toolResult(mint('r'), result.data.tool_use_id, text)
  }
}

function* claudeStep(e: ClaudeEvent, ctx: StepContext): Generator<StreamChunk> {
  if ((e.type === 'system' || e.type === 'result') && e.session_id) ctx.onSessionId(e.session_id)
  if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
    for (const part of e.message.content) yield* blockChunks(part, ctx.mint)
  }
  if (e.type === 'user' && e.message) yield* toolResultChunks(e.message.content, ctx.mint)
}

export function claudeToAguiEvents(lines: AsyncIterable<string>, opts: HarnessDecodeOpts): AsyncGenerator<StreamChunk> {
  return runAgui(lines, ClaudeEventSchema, opts, claudeStep)
}
