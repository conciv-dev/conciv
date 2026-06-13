import {z} from 'zod'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {TextBlock, ThinkingBlock, ToolUseBlock, ToolResultBlock} from './blocks.js'

// Translate Claude's `--output-format stream-json` NDJSON into the AG-UI StreamChunk stream the
// widget speaks: RUN_STARTED → (TEXT | THINKING | TOOL_CALL)* → RUN_FINISHED. Shapes are
// Zod-validated; unknown blocks are skipped.

export type AguiStreamOpts = {
  onSessionId?: (id: string) => void
}

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

function parseEvent(line: string): ClaudeEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const result = ClaudeEventSchema.safeParse(JSON.parse(trimmed))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

// Emit the AG-UI events for one Claude assistant content block (validated per-block).
function* blockChunks(part: unknown, ids: {n: number}): Generator<StreamChunk> {
  const text = TextBlock.safeParse(part)
  if (text.success) {
    ids.n += 1
    const messageId = `m${ids.n}`
    yield {type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant'}
    yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: text.data.text}
    yield {type: EventType.TEXT_MESSAGE_END, messageId}
    return
  }
  const thinking = ThinkingBlock.safeParse(part)
  if (thinking.success) {
    ids.n += 1
    const messageId = `t${ids.n}`
    yield {type: EventType.REASONING_MESSAGE_START, messageId, role: 'reasoning'}
    yield {type: EventType.REASONING_MESSAGE_CONTENT, messageId, delta: thinking.data.thinking}
    yield {type: EventType.REASONING_MESSAGE_END, messageId}
    return
  }
  const tool = ToolUseBlock.safeParse(part)
  if (tool.success) {
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: tool.data.id,
      toolCallName: tool.data.name,
      toolName: tool.data.name,
    }
    yield {type: EventType.TOOL_CALL_ARGS, toolCallId: tool.data.id, delta: JSON.stringify(tool.data.input ?? {})}
    yield {type: EventType.TOOL_CALL_END, toolCallId: tool.data.id}
  }
}

// Emit a TOOL_CALL_RESULT for each tool_result block in a Claude `user` event.
function* toolResultChunks(content: unknown, ids: {n: number}): Generator<StreamChunk> {
  if (!Array.isArray(content)) return
  for (const part of content) {
    const result = ToolResultBlock.safeParse(part)
    if (!result.success) continue
    ids.n += 1
    const raw = result.data.content
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '')
    yield {type: EventType.TOOL_CALL_RESULT, messageId: `r${ids.n}`, toolCallId: result.data.tool_use_id, content: text}
  }
}

export async function* claudeToAguiEvents(
  lines: AsyncIterable<string>,
  opts: AguiStreamOpts = {},
): AsyncGenerator<StreamChunk> {
  const threadId = 'devgent-chat'
  const runId = 'devgent-run'
  const ids = {n: 0}
  yield {type: EventType.RUN_STARTED, threadId, runId}
  for await (const line of lines) {
    const e = parseEvent(line)
    if (!e) continue
    if ((e.type === 'system' || e.type === 'result') && e.session_id) opts.onSessionId?.(e.session_id)
    if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
      for (const part of e.message.content) yield* blockChunks(part, ids)
    }
    if (e.type === 'user' && e.message) {
      yield* toolResultChunks(e.message.content, ids)
    }
  }
  yield {type: EventType.RUN_FINISHED, threadId, runId, finishReason: 'stop'}
}
