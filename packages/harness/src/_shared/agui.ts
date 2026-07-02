import type {ZodType} from 'zod'
import {EventType, type StreamChunk, type ToolOutputState} from '@tanstack/ai'
import type {HarnessDecodeOpts} from '@conciv/protocol/harness-types'
import {snapshotToTokenUsage, type UsageSnapshot} from '@conciv/protocol/usage-types'
import {aguiToolDurationFor} from '@conciv/protocol/tool-timing'

export type Mint = (prefix: string) => string

export type StepContext = {mint: Mint; onSessionId: (id: string) => void}
export type Step<E> = (event: E, ctx: StepContext) => Iterable<StreamChunk>

export type UsageExtractor<E> = (event: E) => Partial<UsageSnapshot> | null

function definedOnly(delta: Partial<UsageSnapshot>): Partial<UsageSnapshot> {
  const out: Partial<UsageSnapshot> = {}
  for (const [k, v] of Object.entries(delta)) if (v !== undefined) (out as Record<string, unknown>)[k] = v
  return out
}

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
  const runId = opts.runId ?? 'conciv-run'
  const threadId = opts.threadId ?? 'conciv-chat'

  const counter = {n: 0}
  const mint: Mint = (prefix) => {
    counter.n += 1
    return `${threadId}-${prefix}${counter.n}`
  }
  let usage: UsageSnapshot = {}
  let sawUsage = false
  const callStarts = new Map<string, number>()
  yield {type: EventType.RUN_STARTED, threadId, runId}
  for await (const event of events) {
    for (const chunk of step(event, {mint, onSessionId: opts.onSessionId})) {
      if (chunk.type === EventType.TOOL_CALL_START && chunk.toolCallId && !callStarts.has(chunk.toolCallId)) {
        callStarts.set(chunk.toolCallId, Date.now())
      }
      yield chunk
      if (chunk.type === EventType.TOOL_CALL_RESULT && chunk.toolCallId) {
        const start = callStarts.get(chunk.toolCallId)
        if (start !== undefined) yield aguiToolDurationFor(chunk.toolCallId, Date.now() - start)
      }
    }
    if (extractUsage) {
      const delta = extractUsage(event)
      if (delta) {
        usage = {...usage, ...definedOnly(delta)}
        sawUsage = true
        opts.onUsage?.(usage)
      }
    }
  }

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
