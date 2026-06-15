import {z} from 'zod'
import type {StreamChunk} from '@tanstack/ai'
import type {HarnessDecodeOpts} from '@aidx/protocol/harness-types'
import {TextBlock, ThinkingBlock, ToolUseBlock, ToolResultBlock} from './blocks.js'
import type {UsageSnapshot} from '@aidx/protocol/usage-types'
import {
  runAgui,
  textMessage,
  reasoningMessage,
  toolCall,
  toolResult,
  type Mint,
  type StepContext,
  type UsageExtractor,
} from '../_shared/agui.js'

// Translate Claude's `--output-format stream-json` NDJSON into the AG-UI StreamChunk stream.
// Only the event schema + the event→chunks mapping are claude-specific; the run lifecycle, line
// loop, and chunk emitters live in ../_shared/agui.ts.

const ClaudeEventSchema = z
  .object({
    type: z.string(),
    session_id: z.string().optional(),
    message: z
      .object({content: z.array(z.unknown()).optional(), model: z.string().optional(), usage: z.unknown().optional()})
      .loose()
      .optional(),
    total_cost_usd: z.number().optional(),
    num_turns: z.number().optional(),
    modelUsage: z.record(z.string(), z.unknown()).optional(),
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

const ClaudeUsage = z
  .object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    cache_read_input_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().optional(),
  })
  .loose()
const ClaudeModelUsage = z.object({contextWindow: z.number().optional()}).loose()

// modelUsage is keyed BY model id (e.g. "claude-opus-4-8[1m]"); a turn has one entry.
function pickModelUsage(m: Record<string, unknown> | undefined): {modelId: string; entry: unknown} | null {
  if (!m) return null
  const [modelId] = Object.keys(m)
  return modelId === undefined ? null : {modelId, entry: m[modelId]}
}

const claudeUsage: UsageExtractor<ClaudeEvent> = (e) => {
  if (e.type === 'assistant') {
    const u = ClaudeUsage.safeParse(e.message?.usage)
    if (!u.success) return null
    return {
      modelId: typeof e.message?.model === 'string' ? e.message.model : undefined,
      inputTokens: u.data.input_tokens,
      outputTokens: u.data.output_tokens,
      cacheReadTokens: u.data.cache_read_input_tokens,
      cacheWriteTokens: u.data.cache_creation_input_tokens,
    }
  }
  if (e.type === 'result') {
    const picked = pickModelUsage(e.modelUsage)
    const win = picked ? ClaudeModelUsage.safeParse(picked.entry) : undefined
    return {
      modelId: picked?.modelId,
      contextWindow: win?.success ? win.data.contextWindow : undefined,
      totalCostUsd: e.total_cost_usd,
      numTurns: e.num_turns,
    }
  }
  return null
}

export function claudeToAguiEvents(lines: AsyncIterable<string>, opts: HarnessDecodeOpts): AsyncGenerator<StreamChunk> {
  return runAgui(lines, ClaudeEventSchema, opts, claudeStep, claudeUsage)
}
