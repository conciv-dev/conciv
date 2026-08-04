import type {ModelMessage, StreamChunk, UIMessage} from '@tanstack/ai'
import type {SubscribeConnectionAdapter} from '@tanstack/ai-solid'
import {AsyncRetryer} from '@tanstack/pacer'
import type {RpcClient} from '@conciv/contract'
import type {ChatContentPart} from '@conciv/protocol/chat-types'

export type ChatConnectionOptions = {
  retryDelayMs?: number
  onRetry?: (error: unknown) => void
}

export type ChatConnection = SubscribeConnectionAdapter & {refresh: () => void}

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

function partMetadata(part: Record<string, unknown>): {metadata?: Record<string, unknown>} {
  const metadata = part.metadata
  return typeof metadata === 'object' && metadata !== null ? {metadata: {...metadata}} : {}
}

export function partContent(part: unknown): ChatContentPart[] {
  if (!isRecord(part)) return []
  if (part.type === 'text' && typeof part.content === 'string')
    return [{type: 'text', content: part.content, ...partMetadata(part)}]
  if (part.type !== 'image' && part.type !== 'document') return []
  const source = imageSource(part.source)
  if (!source) return []
  if (part.type === 'image') return [{type: 'image', source, ...partMetadata(part)}]
  return [{type: 'document', source, ...partMetadata(part)}]
}

function textOf(message: UIMessage | ModelMessage): string {
  if ('parts' in message) {
    return message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join('\n')
  }
  return typeof message.content === 'string' ? message.content : ''
}

function contentFromParts(parts: ChatContentPart[], fallback: string): string | ChatContentPart[] {
  if (parts.length === 0) return fallback
  if (parts.every((part) => part.type === 'text')) return parts.map((part) => part.content ?? '').join('\n')
  return parts
}

function contentOf(message: UIMessage | ModelMessage): string | ChatContentPart[] {
  if ('parts' in message) return contentFromParts(message.parts.flatMap(partContent), textOf(message))
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) return contentFromParts(message.content.flatMap(partContent), '')
  return ''
}

function turnContent(messages: Array<UIMessage> | Array<ModelMessage>): string | ChatContentPart[] {
  const last = messages[messages.length - 1]
  return last ? contentOf(last) : ''
}

type SessionStream = AsyncIterable<StreamChunk>

async function openStream(
  rpc: RpcClient,
  sessionId: string,
  options: ChatConnectionOptions,
  signal: AbortSignal,
): Promise<SessionStream | undefined> {
  const retryer = new AsyncRetryer(async () => await rpc.chat.subscribe({sessionId}, {signal}), {
    backoff: 'fixed',
    baseWait: options.retryDelayMs ?? 500,
    throwOnError: false,
    maxAttempts: () => (signal.aborted ? 1 : Number.MAX_SAFE_INTEGER),
    onRetry: (_attempt, error) => options.onRetry?.(error),
  })
  const abortRetryer = () => retryer.abort()
  signal.addEventListener('abort', abortRetryer, {once: true})
  try {
    return await retryer.execute()
  } finally {
    signal.removeEventListener('abort', abortRetryer)
  }
}

type StreamControl = {attempt: AbortController | null}

function stillListening(consumerSignal: AbortSignal | undefined): boolean {
  return !(consumerSignal?.aborted ?? false)
}

function scopedSignal(consumerSignal: AbortSignal | undefined, attempt: AbortController): AbortSignal {
  if (!consumerSignal) return attempt.signal
  return AbortSignal.any([consumerSignal, attempt.signal])
}

async function* subscribeStream(
  rpc: RpcClient,
  sessionId: string,
  options: ChatConnectionOptions,
  control: StreamControl,
  consumerSignal: AbortSignal | undefined,
): AsyncGenerator<StreamChunk> {
  while (stillListening(consumerSignal)) {
    const attempt = new AbortController()
    control.attempt = attempt
    const stream = await openStream(rpc, sessionId, options, scopedSignal(consumerSignal, attempt))
    if (!stream) return
    try {
      yield* stream
      if (!attempt.signal.aborted) return
    } catch (error) {
      if (!stillListening(consumerSignal)) return
      if (!attempt.signal.aborted) options.onRetry?.(error)
    }
  }
}

export function chatConnection(rpc: RpcClient, sessionId: string, options: ChatConnectionOptions = {}): ChatConnection {
  const control: StreamControl = {attempt: null}
  return {
    subscribe: (abortSignal) => subscribeStream(rpc, sessionId, options, control, abortSignal),
    send: async (messages, _data, abortSignal, runContext) => {
      const runId = runContext?.runId
      if (!runId) throw new Error('chat.send needs the run id the chat client minted for this turn')
      const content = turnContent(messages)
      await rpc.chat.stop({sessionId}, {signal: abortSignal})
      await rpc.chat.send({sessionId, runId, content}, {signal: abortSignal})
    },
    refresh: () => control.attempt?.abort(),
  }
}
