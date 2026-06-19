import type {ZodType} from 'zod'
import {EventType, type StreamChunk, type ToolOutputState} from '@tanstack/ai'
import type {HarnessDecodeOpts} from '@mandarax/protocol/harness-types'
import {snapshotToTokenUsage, type UsageSnapshot} from '@mandarax/protocol/usage-types'

// Shared decoder spine: run lifecycle, line loop, parse, id minter, AG-UI chunk emitters.
// An adapter supplies only its Zod event schema and a pure event→chunks `step`.

// Mints monotonic message ids (`m1`, `t2`, `r3`, …) shared across a turn's messages.
export type Mint = (prefix: string) => string

export type StepContext = {mint: Mint; onSessionId: (id: string) => void}
export type Step<E> = (event: E, ctx: StepContext) => Iterable<StreamChunk>

// Pure per-harness usage map: one event → the usage fields it carries (absolute), or null. The spine merges these and attaches the result to RUN_FINISHED.
export type UsageExtractor<E> = (event: E) => Partial<UsageSnapshot> | null

// Drop undefined-valued keys so a partial never clobbers a known field with a blank.
function definedOnly(delta: Partial<UsageSnapshot>): Partial<UsageSnapshot> {
  const out: Partial<UsageSnapshot> = {}
  for (const [k, v] of Object.entries(delta)) if (v !== undefined) (out as Record<string, unknown>)[k] = v
  return out
}

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
  if (text) yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: id, delta: text}
  yield {type: EventType.TEXT_MESSAGE_END, messageId: id}
}

export function* reasoningMessage(id: string, text: string): Generator<StreamChunk> {
  yield {type: EventType.REASONING_MESSAGE_START, messageId: id, role: 'reasoning'}
  if (text) yield {type: EventType.REASONING_MESSAGE_CONTENT, messageId: id, delta: text}
  yield {type: EventType.REASONING_MESSAGE_END, messageId: id}
}

export function* toolCall(toolCallId: string, name: string, input: unknown): Generator<StreamChunk> {
  yield {type: EventType.TOOL_CALL_START, toolCallId, toolCallName: name, toolName: name}
  yield {type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(input ?? {})}
  yield {type: EventType.TOOL_CALL_END, toolCallId}
}

// `state` is tanstack/ai's ToolOutputState wire value: the StreamProcessor maps 'output-error' →
// result part state 'error' and anything else → 'complete'. Omitting it silently rendered every
// failed tool as a success, so each harness now passes its real outcome.
export function* toolResult(
  messageId: string,
  toolCallId: string,
  content: string,
  state: ToolOutputState = 'output-available',
): Generator<StreamChunk> {
  yield {type: EventType.TOOL_CALL_RESULT, messageId, toolCallId, content, state}
}

async function* parsedLines<E>(
  lines: AsyncIterable<string>,
  schema: ZodType<E>,
  logger?: HarnessDecodeOpts['logger'],
): AsyncGenerator<E> {
  for await (const line of lines) {
    logger?.provider('harness-line', {line})
    const event = parseJsonLine(line, schema)
    if (event !== null) yield event
  }
}

export async function* runAguiEvents<E>(
  events: AsyncIterable<E>,
  opts: HarnessDecodeOpts,
  step: Step<E>,
  extractUsage?: UsageExtractor<E>,
): AsyncGenerator<StreamChunk> {
  const runId = opts.runId ?? 'mandarax-run'
  const threadId = opts.threadId ?? 'mandarax-chat'
  // Scope minted ids to this turn (threadId is fresh per turn) so a later turn never reuses an
  // earlier turn's message id — a collision makes the widget update the old message in place
  // (reply renders above the question, or not at all) instead of appending a new one.
  const counter = {n: 0}
  const mint: Mint = (prefix) => {
    counter.n += 1
    return `${threadId}-${prefix}${counter.n}`
  }
  let usage: UsageSnapshot = {}
  let sawUsage = false
  yield {type: EventType.RUN_STARTED, threadId, runId}
  for await (const event of events) {
    yield* step(event, {mint, onSessionId: opts.onSessionId})
    if (extractUsage) {
      const delta = extractUsage(event)
      if (delta) {
        usage = {...usage, ...definedOnly(delta)}
        sawUsage = true
        opts.onUsage?.(usage)
      }
    }
  }
  // Usage rides the native RunFinishedEvent.usage field; omitted when the harness reported nothing.
  yield {
    type: EventType.RUN_FINISHED,
    threadId,
    runId,
    finishReason: 'stop',
    ...(sawUsage ? {usage: snapshotToTokenUsage(usage), model: usage.modelId} : {}),
  }
}

export function runAgui<E>(
  lines: AsyncIterable<string>,
  schema: ZodType<E>,
  opts: HarnessDecodeOpts,
  step: Step<E>,
  extractUsage?: UsageExtractor<E>,
): AsyncGenerator<StreamChunk> {
  return runAguiEvents(parsedLines(lines, schema, opts.logger), opts, step, extractUsage)
}
