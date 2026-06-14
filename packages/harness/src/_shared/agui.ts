import type {ZodType} from 'zod'
import {EventType, type StreamChunk} from '@tanstack/ai'

// The shared spine every harness decoder rides: RUN_STARTED → per-event chunks → RUN_FINISHED,
// the NDJSON line loop, JSON-parse-and-validate, the monotonic id minter, and the AG-UI chunk
// emitters (which are protocol-shaped, not adapter-shaped). An adapter supplies only its Zod
// event schema and a pure event→chunks `step`.

const THREAD_ID = 'aidx-chat'
const RUN_ID = 'aidx-run'

export type SessionSink = {onSessionId(id: string): void}

// Mints monotonic message ids (`m1`, `t2`, `r3`, …) shared across a turn's messages.
export type Mint = (prefix: string) => string

export type StepContext = {mint: Mint; onSessionId: (id: string) => void}
export type Step<E> = (event: E, ctx: StepContext) => Iterable<StreamChunk>

// Parse one NDJSON line and validate it against the schema; null on blank / unparseable / invalid.
export function parseJsonLine<T>(line: string, schema: ZodType<T>): T | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const result = schema.safeParse(JSON.parse(trimmed))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function* textMessage(id: string, text: string): Generator<StreamChunk> {
  yield {type: EventType.TEXT_MESSAGE_START, messageId: id, role: 'assistant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: id, delta: text}
  yield {type: EventType.TEXT_MESSAGE_END, messageId: id}
}

export function* reasoningMessage(id: string, text: string): Generator<StreamChunk> {
  yield {type: EventType.REASONING_MESSAGE_START, messageId: id, role: 'reasoning'}
  yield {type: EventType.REASONING_MESSAGE_CONTENT, messageId: id, delta: text}
  yield {type: EventType.REASONING_MESSAGE_END, messageId: id}
}

export function* toolCall(toolCallId: string, name: string, input: unknown): Generator<StreamChunk> {
  yield {type: EventType.TOOL_CALL_START, toolCallId, toolCallName: name, toolName: name}
  yield {type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(input ?? {})}
  yield {type: EventType.TOOL_CALL_END, toolCallId}
}

export function* toolResult(messageId: string, toolCallId: string, content: string): Generator<StreamChunk> {
  yield {type: EventType.TOOL_CALL_RESULT, messageId, toolCallId, content}
}

export async function* runAgui<E>(
  lines: AsyncIterable<string>,
  schema: ZodType<E>,
  opts: SessionSink,
  step: Step<E>,
): AsyncGenerator<StreamChunk> {
  const counter = {n: 0}
  const mint: Mint = (prefix) => {
    counter.n += 1
    return `${prefix}${counter.n}`
  }
  yield {type: EventType.RUN_STARTED, threadId: THREAD_ID, runId: RUN_ID}
  for await (const line of lines) {
    const event = parseJsonLine(line, schema)
    if (event === null) continue
    yield* step(event, {mint, onSessionId: opts.onSessionId})
  }
  yield {type: EventType.RUN_FINISHED, threadId: THREAD_ID, runId: RUN_ID, finishReason: 'stop'}
}
