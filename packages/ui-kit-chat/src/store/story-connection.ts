import {EventType, type StreamChunk} from '@tanstack/ai'
import type {ConnectConnectionAdapter} from '@tanstack/ai-client'

export type StoryConnectionOptions = {
  chunks?: StreamChunk[]
  chunkDelay?: number
  shouldError?: boolean
  error?: Error
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

const present = (chunk: StreamChunk | null): chunk is StreamChunk => chunk !== null

export function storyConnection(options?: StoryConnectionOptions): ConnectConnectionAdapter {
  return {
    async *connect(_messages, _data, abortSignal, runContext) {
      const threadId = runContext?.threadId ?? 'story-thread'
      const runId = runContext?.runId ?? 'story-run'
      const delay = options?.chunkDelay ?? 0
      yield {type: EventType.RUN_STARTED, threadId, runId}
      for (const chunk of options?.chunks ?? []) {
        if (abortSignal?.aborted) return
        if (delay > 0) await sleep(delay, abortSignal)
        yield chunk
      }
      if (options?.shouldError) {
        yield {type: EventType.RUN_ERROR, message: (options.error ?? new Error('Story stream error')).message}
        return
      }
      yield {type: EventType.RUN_FINISHED, threadId, runId, finishReason: 'stop'}
    },
  }
}

export function createTextChunks(text: string, messageId = 'story-text'): StreamChunk[] {
  const chunks: Array<StreamChunk | null> = [
    {type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant'},
    text ? {type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: text} : null,
    {type: EventType.TEXT_MESSAGE_END, messageId},
  ]
  return chunks.filter(present)
}

export function createReasoningChunks(text: string, messageId = 'story-reasoning'): StreamChunk[] {
  const chunks: Array<StreamChunk | null> = [
    {type: EventType.REASONING_MESSAGE_START, messageId, role: 'reasoning'},
    text ? {type: EventType.REASONING_MESSAGE_CONTENT, messageId, delta: text} : null,
    {type: EventType.REASONING_MESSAGE_END, messageId},
  ]
  return chunks.filter(present)
}

export type ToolChunkOptions = {
  toolCallId?: string
  messageId?: string
  result?: string
  state?: 'output-available' | 'output-error'
}

export function createToolCallChunks(name: string, input: unknown, options?: ToolChunkOptions): StreamChunk[] {
  const toolCallId = options?.toolCallId ?? `story-${name}`
  const messageId = options?.messageId ?? `story-${name}-result`
  const chunks: Array<StreamChunk | null> = [
    {type: EventType.TOOL_CALL_START, toolCallId, toolCallName: name, toolName: name},
    {type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(input ?? {})},
    {type: EventType.TOOL_CALL_END, toolCallId},
    options?.result === undefined
      ? null
      : {
          type: EventType.TOOL_CALL_RESULT,
          messageId,
          toolCallId,
          content: options.result,
          state: options.state ?? 'output-available',
        },
  ]
  return chunks.filter(present)
}

export function createApprovalChunk(
  name: string,
  input: unknown,
  options?: {toolCallId?: string; approvalId?: string},
): StreamChunk {
  const toolCallId = options?.toolCallId ?? `story-${name}`
  const approvalId = options?.approvalId ?? `story-${name}-approval`
  return {
    type: EventType.CUSTOM,
    name: 'approval-requested',
    value: {toolCallId, toolName: name, input, approval: {id: approvalId, needsApproval: true}},
  }
}
