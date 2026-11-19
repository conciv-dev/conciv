import {generateMessageId} from '@tanstack/ai'
import {chat, StreamProcessor} from '@tanstack/ai'
import type {CapabilityContext} from '@tanstack/ai'
import type {ConnectConnectionAdapter} from '@tanstack/ai-client'
import {getToolBridgeProvisioner} from '@tanstack/ai-sandbox'
import {z} from 'zod'
import type {TextAdapter} from './adapters/adapters.js'
import type {ChatMessage, ModelMessage} from '@conciv/protocol/chat-message-types'
import {
  approvalRequestedEvent,
  ChatEventType,
  type ChatCustomEvent,
  type ChatEvent,
} from '@conciv/protocol/chat-event-types'

export {ChatClient} from '@tanstack/ai-client'
export {fakeText} from '@tanstack/ai/testing'

export type ChatCapabilities = CapabilityContext

export type PermissionPromptCall = {
  threadId: string
  toolName: string
  input: unknown
  signal?: AbortSignal
  cut?: AbortSignal
}

const PERMISSION_TOOL = 'approval_prompt'

const ADAPTER_DEFAULT_DENIAL = {
  behavior: 'deny' as const,
  message: 'Awaiting client approval. Approve in the UI and re-run to continue.',
}

const PromptReplySchema = z.object({
  result: z.object({content: z.tuple([z.object({type: z.literal('text'), text: z.string()})])}),
})

export async function callPermissionPrompt(
  capabilities: ChatCapabilities,
  call: PermissionPromptCall,
): Promise<string> {
  const served = await getToolBridgeProvisioner(capabilities).provision([], {
    provider: 'local-process',
    threadId: call.threadId,
    permission: {toolName: PERMISSION_TOOL, resolve: () => ADAPTER_DEFAULT_DENIAL},
    ...(call.signal === undefined ? {} : {signal: call.signal}),
  })
  try {
    const reply = await fetch(served.url, {
      method: 'POST',
      headers: {authorization: `Bearer ${served.token}`, 'content-type': 'application/json'},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {name: PERMISSION_TOOL, arguments: {tool_name: call.toolName, input: call.input}},
      }),
      signal: AbortSignal.any([call.cut, call.signal].filter((each) => each !== undefined)),
    })
    return PromptReplySchema.parse(await reply.json()).result.content[0].text
  } catch (error) {
    return `the permission prompt call failed: ${String(error)}`
  } finally {
    await served.close()
  }
}

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

type ToolResultChunkOptions = {
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
    messageId: options?.messageId ?? generateMessageId(),
    toolCallId,
    content,
    ...(options?.state === 'output-error' && {metadata: {tanstack: {state: 'output-error'}}}),
  }
}

type ToolChunkOptions = ToolResultChunkOptions & {
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

export function createApprovalChunk(name: string, input: unknown, options?: {approvalId?: string}): ChatCustomEvent {
  return approvalRequestedEvent.create({approvalId: options?.approvalId ?? `conciv:tool:${name}`, title: name, input})
}

export async function runAdapterTurn(adapter: TextAdapter, messages: ModelMessage[]): Promise<ChatEvent[]> {
  const events: ChatEvent[] = []
  for await (const event of chat({adapter, threadId: 'testkit', messages})) events.push(event)
  return events
}

export function foldChatEvents(events: Iterable<ChatEvent>): ChatMessage[] {
  const processor = new StreamProcessor({})
  for (const event of events) processor.processChunk(event)
  return processor.getMessages()
}
