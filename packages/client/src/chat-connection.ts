import {EventType, type ModelMessage, type StreamChunk, type UIMessage} from '@tanstack/ai'
import type {SubscribeConnectionAdapter} from '@tanstack/ai-solid'
import type {RpcClient} from '@conciv/contract'
import type {ChatContentPart} from '@conciv/protocol/chat-types'

export type ChatConnectionOptions = {retryDelayMs?: number; onRetry?: (error: unknown) => void}

function textOf(message: UIMessage | ModelMessage): string {
  if ('parts' in message) {
    return message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join('\n')
  }
  return typeof message.content === 'string' ? message.content : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

type ImageContentPart = Extract<ChatContentPart, {type: 'image'}>

function imageSource(source: unknown): ImageContentPart['source'] | undefined {
  if (
    !isRecord(source) ||
    source.type !== 'data' ||
    typeof source.value !== 'string' ||
    typeof source.mimeType !== 'string' ||
    source.mimeType.length === 0
  )
    return undefined
  return {type: 'data', value: source.value, mimeType: source.mimeType}
}

function partContent(part: unknown): ChatContentPart[] {
  if (!isRecord(part)) return []
  if (part.type === 'text' && typeof part.content === 'string') return [{type: 'text', content: part.content}]
  if (part.type !== 'image') return []
  const source = imageSource(part.source)
  return source ? [{type: 'image', source}] : []
}

function contentFromParts(parts: ChatContentPart[], fallback: string): string | ChatContentPart[] {
  if (parts.length === 0) return fallback
  if (parts.every((part) => part.type === 'text')) return parts.map((part) => part.content ?? '').join('\n')
  return parts
}

function contentOf(message: UIMessage | ModelMessage): string | ChatContentPart[] {
  if ('parts' in message) {
    const parts = message.parts.flatMap(partContent)
    return contentFromParts(parts, textOf(message))
  }
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) return contentFromParts(message.content.flatMap(partContent), '')
  return ''
}

function lastUserContent(messages: Array<UIMessage> | Array<ModelMessage>): string | ChatContentPart[] {
  const last = messages[messages.length - 1]
  return last ? contentOf(last) : ''
}

function aborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false
}

function isBusyError(error: unknown): boolean {
  return isRecord(error) && error.code === 'BUSY'
}

type SessionBridge = {
  blockActiveRunTerminals: () => void
  deliver: (chunk: StreamChunk) => boolean
}

function runIdOf(chunk: StreamChunk): string | undefined {
  return 'runId' in chunk && typeof chunk.runId === 'string' ? chunk.runId : undefined
}

function isTerminalChunk(chunk: StreamChunk): boolean {
  return chunk.type === EventType.RUN_FINISHED || chunk.type === EventType.RUN_ERROR
}

function sessionBridge(): SessionBridge {
  let activeRunId: string | undefined
  let blockedTerminalRunId: string | undefined
  let blockNextStartedRun = false
  return {
    blockActiveRunTerminals: () => {
      blockedTerminalRunId = activeRunId
      blockNextStartedRun = activeRunId === undefined
    },
    deliver: (chunk) => {
      const runId = runIdOf(chunk)
      if (chunk.type === EventType.RUN_STARTED) {
        activeRunId = runId
        if (blockNextStartedRun) {
          blockedTerminalRunId = runId
          blockNextStartedRun = false
        }
        return true
      }
      if (!isTerminalChunk(chunk)) return true
      activeRunId = undefined
      if (blockedTerminalRunId === undefined || (runId !== undefined && runId !== blockedTerminalRunId)) return true
      blockedTerminalRunId = undefined
      return false
    },
  }
}

async function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      {once: true},
    )
  })
}

async function sendWhenAvailable(
  rpc: RpcClient,
  input: Parameters<RpcClient['chat']['send']>[0],
  options: ChatConnectionOptions,
  bridge: SessionBridge,
  signal: AbortSignal | undefined,
): Promise<void> {
  let blockedRunTerminal = false
  while (!aborted(signal)) {
    try {
      await rpc.chat.send(input, {signal})
      return
    } catch (error) {
      if (!isBusyError(error) || aborted(signal)) throw error
      if (!blockedRunTerminal) {
        bridge.blockActiveRunTerminals()
        blockedRunTerminal = true
      }
      options.onRetry?.(error)
      await sleep(options.retryDelayMs ?? 500, signal)
    }
  }
  signal?.throwIfAborted()
}

async function* attachOnce(
  rpc: RpcClient,
  sessionId: string,
  options: ChatConnectionOptions,
  signal: AbortSignal | undefined,
): AsyncGenerator<StreamChunk> {
  try {
    yield* await rpc.chat.attach({sessionId}, {signal})
  } catch (error) {
    if (!aborted(signal)) options.onRetry?.(error)
  }
}

async function* attachLoop(
  rpc: RpcClient,
  sessionId: string,
  options: ChatConnectionOptions,
  signal: AbortSignal | undefined,
): AsyncGenerator<StreamChunk> {
  while (!aborted(signal)) {
    yield* attachOnce(rpc, sessionId, options, signal)
    if (aborted(signal)) return
    await sleep(options.retryDelayMs ?? 500, signal)
  }
}

async function* bridgedAttachLoop(
  rpc: RpcClient,
  sessionId: string,
  options: ChatConnectionOptions,
  bridge: SessionBridge,
  signal: AbortSignal | undefined,
): AsyncGenerator<StreamChunk> {
  for await (const chunk of attachLoop(rpc, sessionId, options, signal)) {
    if (bridge.deliver(chunk)) yield chunk
  }
}

export function chatConnection(
  rpc: RpcClient,
  sessionId: string,
  options: ChatConnectionOptions = {},
): SubscribeConnectionAdapter {
  const bridge = sessionBridge()
  return {
    subscribe: (abortSignal) => bridgedAttachLoop(rpc, sessionId, options, bridge, abortSignal),
    send: async (messages, _data, abortSignal) => {
      const content = lastUserContent(messages)
      const input = typeof content === 'string' ? {sessionId, text: content} : {sessionId, content}
      await sendWhenAvailable(rpc, input, options, bridge, abortSignal)
    },
  }
}
