import {z} from 'zod'
import {EventType, type StreamChunk} from '@tanstack/ai'

// Translate `codex exec --json` JSONL events into the AG-UI StreamChunk stream the widget
// speaks: RUN_STARTED → (TEXT | REASONING | TOOL_CALL)* → RUN_FINISHED. Event shapes verified
// against the codex CLI docs; unknown events are skipped. thread_id surfaces the session id.

const AgentMessageItem = z.object({type: z.literal('agent_message'), id: z.string(), text: z.string()})
const ReasoningItem = z.object({type: z.literal('reasoning'), id: z.string(), text: z.string()})
const CommandItem = z.object({
  type: z.literal('command_execution'),
  id: z.string(),
  command: z.string(),
  aggregated_output: z.string().optional(),
})

const CodexEventSchema = z
  .object({
    type: z.string(),
    thread_id: z.string().optional(),
    item: z.unknown().optional(),
  })
  .loose()

function parseEvent(line: string): z.infer<typeof CodexEventSchema> | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const result = CodexEventSchema.safeParse(JSON.parse(trimmed))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function* textChunks(text: string, ids: {n: number}): Generator<StreamChunk> {
  ids.n += 1
  const messageId = `m${ids.n}`
  yield {type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: text}
  yield {type: EventType.TEXT_MESSAGE_END, messageId}
}

function* reasoningChunks(text: string, ids: {n: number}): Generator<StreamChunk> {
  ids.n += 1
  const messageId = `t${ids.n}`
  yield {type: EventType.REASONING_MESSAGE_START, messageId, role: 'reasoning'}
  yield {type: EventType.REASONING_MESSAGE_CONTENT, messageId, delta: text}
  yield {type: EventType.REASONING_MESSAGE_END, messageId}
}

// A completed command_execution maps to a full tool-call lifecycle plus its captured output.
function* commandChunks(cmd: z.infer<typeof CommandItem>, ids: {n: number}): Generator<StreamChunk> {
  yield {type: EventType.TOOL_CALL_START, toolCallId: cmd.id, toolCallName: 'shell', toolName: 'shell'}
  yield {type: EventType.TOOL_CALL_ARGS, toolCallId: cmd.id, delta: JSON.stringify({command: cmd.command})}
  yield {type: EventType.TOOL_CALL_END, toolCallId: cmd.id}
  ids.n += 1
  yield {type: EventType.TOOL_CALL_RESULT, messageId: `r${ids.n}`, toolCallId: cmd.id, content: cmd.aggregated_output ?? ''}
}

function* itemChunks(item: unknown, ids: {n: number}): Generator<StreamChunk> {
  const message = AgentMessageItem.safeParse(item)
  if (message.success) {
    yield* textChunks(message.data.text, ids)
    return
  }
  const reasoning = ReasoningItem.safeParse(item)
  if (reasoning.success) {
    yield* reasoningChunks(reasoning.data.text, ids)
    return
  }
  const command = CommandItem.safeParse(item)
  if (command.success) yield* commandChunks(command.data, ids)
}

export async function* codexToAguiEvents(
  lines: AsyncIterable<string>,
  opts: {onSessionId(id: string): void},
): AsyncGenerator<StreamChunk> {
  const threadId = 'devgent-chat'
  const runId = 'devgent-run'
  const ids = {n: 0}
  yield {type: EventType.RUN_STARTED, threadId, runId}
  for await (const line of lines) {
    const e = parseEvent(line)
    if (!e) continue
    if (e.type === 'thread.started' && e.thread_id) opts.onSessionId(e.thread_id)
    // Emit on completion so partial item.started/updated deltas don't double-render.
    if (e.type === 'item.completed') yield* itemChunks(e.item, ids)
  }
  yield {type: EventType.RUN_FINISHED, threadId, runId, finishReason: 'stop'}
}
