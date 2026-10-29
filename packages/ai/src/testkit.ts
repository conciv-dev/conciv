import type {ConnectConnectionAdapter} from '@tanstack/ai-client'
import {approvalRequestedEvent, ChatEventType, type ChatCustomEvent, type ChatEvent} from './events.js'

export type StoryConnectionOptions = {
  chunks?: ChatEvent[]
  chunkDelay?: number
  shouldError?: boolean
  error?: Error
  runsUntilStopped?: boolean
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id)
        resolve()
      },
      {once: true},
    )
  })
}

function untilStopped(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (!signal || signal.aborted) {
      resolve()
      return
    }
    signal.addEventListener('abort', () => resolve(), {once: true})
  })
}

const present = (chunk: ChatEvent | null): chunk is ChatEvent => chunk !== null

async function* scriptedChunks(options: StoryConnectionOptions, abortSignal?: AbortSignal): AsyncGenerator<ChatEvent> {
  const delay = options.chunkDelay ?? 0
  for (const chunk of options.chunks ?? []) {
    if (delay > 0) await sleep(delay, abortSignal)
    if (abortSignal?.aborted) return
    yield chunk
  }
}

async function* runEnd(
  options: StoryConnectionOptions,
  run: {threadId: string; runId: string},
  abortSignal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  if (abortSignal?.aborted) return
  if (options.shouldError) {
    yield {type: ChatEventType.RUN_ERROR, message: (options.error ?? new Error('Story stream error')).message}
    return
  }
  if (options.runsUntilStopped) {
    await untilStopped(abortSignal)
    return
  }
  yield {type: ChatEventType.RUN_FINISHED, ...run, finishReason: 'stop'}
}

export function storyConnection(options: StoryConnectionOptions = {}): ConnectConnectionAdapter {
  return {
    async *connect(_messages, _data, abortSignal, runContext) {
      const run = {threadId: runContext?.threadId ?? 'story-thread', runId: runContext?.runId ?? 'story-run'}
      yield {type: ChatEventType.RUN_STARTED, ...run}
      yield* scriptedChunks(options, abortSignal)
      yield* runEnd(options, run, abortSignal)
    },
  }
}

export function createTextChunks(text: string, messageId = 'story-text'): ChatEvent[] {
  const chunks: Array<ChatEvent | null> = [
    {type: ChatEventType.TEXT_MESSAGE_START, messageId, role: 'assistant'},
    text ? {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId, delta: text} : null,
    {type: ChatEventType.TEXT_MESSAGE_END, messageId},
  ]
  return chunks.filter(present)
}

export function createReasoningChunks(text: string, messageId = 'story-reasoning'): ChatEvent[] {
  const chunks: Array<ChatEvent | null> = [
    {type: ChatEventType.REASONING_MESSAGE_START, messageId, role: 'reasoning'},
    text ? {type: ChatEventType.REASONING_MESSAGE_CONTENT, messageId, delta: text} : null,
    {type: ChatEventType.REASONING_MESSAGE_END, messageId},
  ]
  return chunks.filter(present)
}

export type ToolResultChunkOptions = {
  messageId?: string
  state?: 'output-available' | 'output-error'
}

export function createToolResultChunk(
  toolCallId: string,
  content: string,
  options?: ToolResultChunkOptions,
): ChatEvent {
  return {
    type: ChatEventType.TOOL_CALL_RESULT,
    messageId: options?.messageId ?? `${toolCallId}-result`,
    toolCallId,
    content,
    ...(options?.state === 'output-error' && {metadata: {tanstack: {state: 'output-error'}}}),
  }
}

export type ToolChunkOptions = ToolResultChunkOptions & {
  toolCallId?: string
  parentMessageId?: string
  result?: string
}

export function createToolCallChunks(name: string, input: unknown, options?: ToolChunkOptions): ChatEvent[] {
  const toolCallId = options?.toolCallId ?? `story-${name}`
  const chunks: Array<ChatEvent | null> = [
    {
      type: ChatEventType.TOOL_CALL_START,
      toolCallId,
      toolCallName: name,
      ...(options?.parentMessageId !== undefined && {parentMessageId: options.parentMessageId}),
    },
    {type: ChatEventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(input ?? {})},
    {type: ChatEventType.TOOL_CALL_END, toolCallId},
    options?.result === undefined
      ? null
      : createToolResultChunk(toolCallId, options.result, {
          messageId: options.messageId ?? `story-${name}-result`,
          state: options.state,
        }),
  ]
  return chunks.filter(present)
}

export function createApprovalChunk(
  name: string,
  input: unknown,
  options?: {toolCallId?: string; approvalId?: string},
): ChatCustomEvent {
  return approvalRequestedEvent.create({
    toolCallId: options?.toolCallId ?? `story-${name}`,
    toolName: name,
    input,
    approval: {id: options?.approvalId ?? `story-${name}-approval`, needsApproval: true},
  })
}
