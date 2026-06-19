import {z} from 'zod'
import {EventType, type StreamChunk} from '@tanstack/ai'
import type {HarnessDecodeOpts} from '@mandarax/protocol/harness-types'
import {TextBlock, ThinkingBlock, ToolUseBlock, ToolResultBlock} from './blocks.js'
import {
  runAgui,
  runAguiEvents,
  textMessage,
  reasoningMessage,
  toolCall,
  toolResult,
  type Mint,
  type Step,
  type UsageExtractor,
} from '../_shared/agui.js'
import type {UsageSnapshot} from '@mandarax/protocol/usage-types'

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
    event: z.unknown().optional(),
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

// --include-partial-messages also wraps the raw Anthropic SSE content stream: each block opens
// (content_block_start), streams deltas (content_block_delta), and closes (content_block_stop).
// We mint one id per block index and split AG-UI START/CONTENT/END across those events, so text
// renders live instead of arriving whole on the terminal `assistant` event.
const StreamContentEvent = z
  .object({
    type: z.string(),
    index: z.number().optional(),
    content_block: z
      .object({type: z.string(), id: z.string().optional(), name: z.string().optional()})
      .loose()
      .optional(),
    delta: z
      .object({
        type: z.string(),
        text: z.string().optional(),
        thinking: z.string().optional(),
        partial_json: z.string().optional(),
      })
      .loose()
      .optional(),
  })
  .loose()
type StreamContent = z.infer<typeof StreamContentEvent>

// A content block opened by content_block_start, kept until its content_block_stop. `mid` is the
// minted message id for text/thinking, or the tool_use id for a tool call.
type OpenBlock = {kind: 'text' | 'thinking' | 'tool'; mid: string; sawArgs?: boolean}

function* openBlock(
  i: number,
  cb: NonNullable<StreamContent['content_block']>,
  open: Map<number, OpenBlock>,
  mint: Mint,
): Generator<StreamChunk> {
  if (cb.type === 'text') {
    const mid = mint('m')
    open.set(i, {kind: 'text', mid})
    yield {type: EventType.TEXT_MESSAGE_START, messageId: mid, role: 'assistant'}
  } else if (cb.type === 'thinking') {
    const mid = mint('t')
    open.set(i, {kind: 'thinking', mid})
    yield {type: EventType.REASONING_MESSAGE_START, messageId: mid, role: 'reasoning'}
  } else if (cb.type === 'tool_use' && cb.id) {
    open.set(i, {kind: 'tool', mid: cb.id})
    yield {type: EventType.TOOL_CALL_START, toolCallId: cb.id, toolCallName: cb.name ?? '', toolName: cb.name ?? ''}
  }
}

function* deltaBlock(block: OpenBlock | undefined, delta: NonNullable<StreamContent['delta']>): Generator<StreamChunk> {
  if (!block) return
  if (block.kind === 'text' && delta.text)
    yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: block.mid, delta: delta.text}
  else if (block.kind === 'thinking' && delta.thinking)
    yield {type: EventType.REASONING_MESSAGE_CONTENT, messageId: block.mid, delta: delta.thinking}
  else if (block.kind === 'tool' && delta.partial_json !== undefined) {
    block.sawArgs = true
    yield {type: EventType.TOOL_CALL_ARGS, toolCallId: block.mid, delta: delta.partial_json}
  }
}

function* closeBlock(i: number, open: Map<number, OpenBlock>): Generator<StreamChunk> {
  const block = open.get(i)
  if (!block) return
  open.delete(i)
  if (block.kind === 'text') yield {type: EventType.TEXT_MESSAGE_END, messageId: block.mid}
  else if (block.kind === 'thinking') yield {type: EventType.REASONING_MESSAGE_END, messageId: block.mid}
  else {
    if (!block.sawArgs) yield {type: EventType.TOOL_CALL_ARGS, toolCallId: block.mid, delta: '{}'} // keep accumulated args valid JSON
    yield {type: EventType.TOOL_CALL_END, toolCallId: block.mid}
  }
}

// Stateful per turn: the open-block map lives for one decode run (one chat turn). Once any block
// has streamed, the terminal `assistant` event is a duplicate — suppress it. With partial messages
// off (older claude), no block ever streams, so we fall back to emitting from `assistant`.
function makeClaudeStep(): Step<ClaudeEvent> {
  const open = new Map<number, OpenBlock>()
  let streamed = false
  return function* (e, ctx) {
    if ((e.type === 'system' || e.type === 'result') && e.session_id) ctx.onSessionId(e.session_id)
    if (e.type === 'stream_event') {
      const ev = StreamContentEvent.safeParse(e.event)
      if (!ev.success || ev.data.index === undefined) return
      const i = ev.data.index
      if (ev.data.type === 'content_block_start' && ev.data.content_block) {
        streamed = true
        yield* openBlock(i, ev.data.content_block, open, ctx.mint)
      } else if (ev.data.type === 'content_block_delta' && ev.data.delta) {
        yield* deltaBlock(open.get(i), ev.data.delta)
      } else if (ev.data.type === 'content_block_stop') {
        yield* closeBlock(i, open)
      }
      return
    }
    if (e.type === 'assistant' && !streamed && Array.isArray(e.message?.content)) {
      for (const part of e.message.content) yield* blockChunks(part, ctx.mint)
    }
    if (e.type === 'user' && e.message) yield* toolResultChunks(e.message.content, ctx.mint)
  }
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
// --include-partial-messages wraps the raw Anthropic SSE: message_start carries the full input
// (context) at the very start of the response; message_delta carries cumulative output.
const ClaudeStreamEvent = z
  .object({
    type: z.string(),
    message: z.object({usage: z.unknown().optional(), model: z.string().optional()}).loose().optional(),
    usage: z.unknown().optional(),
  })
  .loose()

function tokensFrom(u: z.infer<typeof ClaudeUsage>): Partial<UsageSnapshot> {
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens,
    cacheWriteTokens: u.cache_creation_input_tokens,
  }
}

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
    return {modelId: typeof e.message?.model === 'string' ? e.message.model : undefined, ...tokensFrom(u.data)}
  }
  if (e.type === 'stream_event') {
    const ev = ClaudeStreamEvent.safeParse(e.event)
    if (!ev.success) return null
    if (ev.data.type === 'message_start') {
      const u = ClaudeUsage.safeParse(ev.data.message?.usage)
      return u.success ? {modelId: ev.data.message?.model, ...tokensFrom(u.data)} : null
    }
    if (ev.data.type === 'message_delta') {
      const u = ClaudeUsage.safeParse(ev.data.usage)
      return u.success ? tokensFrom(u.data) : null
    }
    return null
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
  return runAgui(lines, ClaudeEventSchema, opts, makeClaudeStep(), claudeUsage)
}

// SDK transport: SDKMessage objects share the CLI stream-json shape, so reuse the same step + usage.
export function claudeMessagesToAgui(
  messages: AsyncIterable<unknown>,
  opts: HarnessDecodeOpts,
): AsyncGenerator<StreamChunk> {
  return runAguiEvents(validatedClaudeEvents(messages), opts, makeClaudeStep(), claudeUsage)
}

async function* validatedClaudeEvents(messages: AsyncIterable<unknown>): AsyncGenerator<ClaudeEvent> {
  for await (const m of messages) {
    const parsed = ClaudeEventSchema.safeParse(m)
    if (parsed.success) yield parsed.data
  }
}
