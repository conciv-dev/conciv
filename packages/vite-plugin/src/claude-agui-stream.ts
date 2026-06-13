import {EventType, type StreamChunk} from '@tanstack/ai'

// Translate Claude's `--output-format stream-json` NDJSON into a TanStack AI AG-UI event
// stream (`StreamChunk`s). We emit the protocol the library + widget already speak —
// RUN_STARTED → (TEXT_MESSAGE_* | THINKING_* | TOOL_CALL_*)* → RUN_FINISHED — so the
// widget's `fetchServerSentEvents` consumes it with zero custom glue.
//
// We deliberately do NOT route this through `chat()`'s agent loop: Claude runs its own
// tool loop (it edits files itself), so TanStack AI here is purely the transport/UI
// protocol, and Claude is the agent.

export type AguiStreamOpts = {
  // Called with Claude's session id when its init/result event carries one, so the route
  // can track which session to --resume next turn.
  onSessionId?: (id: string) => void
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function parseLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const v = JSON.parse(trimmed) as unknown
    return isRecord(v) ? v : null
  } catch {
    return null
  }
}

// Emit the AG-UI events for one Claude assistant content block.
function* blockChunks(part: Record<string, unknown>, ids: {n: number}): Generator<StreamChunk> {
  if (part.type === 'text' && typeof part.text === 'string') {
    ids.n += 1
    const messageId = `m${ids.n}`
    yield {type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant'}
    yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: part.text}
    yield {type: EventType.TEXT_MESSAGE_END, messageId}
    return
  }
  if (part.type === 'thinking' && typeof part.thinking === 'string') {
    ids.n += 1
    const messageId = `t${ids.n}`
    yield {type: EventType.REASONING_MESSAGE_START, messageId, role: 'reasoning'}
    yield {type: EventType.REASONING_MESSAGE_CONTENT, messageId, delta: part.thinking}
    yield {type: EventType.REASONING_MESSAGE_END, messageId}
    return
  }
  if (part.type === 'tool_use' && typeof part.id === 'string' && typeof part.name === 'string') {
    yield {type: EventType.TOOL_CALL_START, toolCallId: part.id, toolCallName: part.name, toolName: part.name}
    yield {type: EventType.TOOL_CALL_ARGS, toolCallId: part.id, delta: JSON.stringify(part.input ?? {})}
    yield {type: EventType.TOOL_CALL_END, toolCallId: part.id}
  }
}

// Emit a TOOL_CALL_RESULT for each tool_result block in a Claude `user` event.
function* toolResultChunks(content: unknown, ids: {n: number}): Generator<StreamChunk> {
  if (!Array.isArray(content)) return
  for (const part of content) {
    if (!isRecord(part)) continue
    if (part.type === 'tool_result' && typeof part.tool_use_id === 'string') {
      ids.n += 1
      const text = typeof part.content === 'string' ? part.content : JSON.stringify(part.content ?? '')
      yield {
        type: EventType.TOOL_CALL_RESULT,
        messageId: `r${ids.n}`,
        toolCallId: part.tool_use_id,
        content: text,
      }
    }
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
    const e = parseLine(line)
    if (!e) continue
    if ((e.type === 'system' || e.type === 'result') && typeof e.session_id === 'string') {
      opts.onSessionId?.(e.session_id)
    }
    if (e.type === 'assistant' && isRecord(e.message)) {
      const content = (e.message as {content?: unknown}).content
      if (Array.isArray(content)) {
        for (const part of content) {
          if (isRecord(part)) yield* blockChunks(part, ids)
        }
      }
    }
    if (e.type === 'user' && isRecord(e.message)) {
      yield* toolResultChunks((e.message as {content?: unknown}).content, ids)
    }
  }
  yield {type: EventType.RUN_FINISHED, threadId, runId, finishReason: 'stop'}
}
