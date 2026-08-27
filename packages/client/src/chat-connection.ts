import type {ModelMessage, StreamChunk, UIMessage} from '@tanstack/ai'
import type {SubscribeConnectionAdapter} from '@tanstack/ai-solid'
import {AsyncRetryer} from '@tanstack/pacer'
import {ORPCError} from '@orpc/client'
import type {RpcClient} from '@conciv/contract'
import type {ChatContentPart} from '@conciv/protocol/chat-types'
import {runLifecycleOf, type RunLifecycle} from '@conciv/protocol/run-types'

export type ChatConnectionOptions = {
  retryDelayMs?: number
  offlineRetryDelayMs?: number
  isOnline?: () => boolean
  onRetry?: (error: unknown) => void
  onLifecycle?: (lifecycle: RunLifecycle) => void
}

const DEFAULT_RETRY_DELAY_MS = 500
const DEFAULT_OFFLINE_RETRY_DELAY_MS = 2000

export function chatRetryDelayMs(options: ChatConnectionOptions): number {
  if (options.isOnline && !options.isOnline()) return options.offlineRetryDelayMs ?? DEFAULT_OFFLINE_RETRY_DELAY_MS
  return options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
}

export function isReachabilityError(error: unknown): boolean {
  return !(error instanceof ORPCError)
}

export type ChatConnection = SubscribeConnectionAdapter & {refresh: () => Promise<void>}

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

function turnMessageId(messages: Array<UIMessage> | Array<ModelMessage>): string | undefined {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'user' || !('id' in last)) return undefined
  return last.id.length > 0 ? last.id : undefined
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
    baseWait: () => chatRetryDelayMs(options),
    throwOnError: false,
    maxAttempts: () => (signal.aborted ? 1 : Number.MAX_SAFE_INTEGER),
    onRetry: (_attempt, error) => {
      if (isReachabilityError(error)) options.onRetry?.(error)
    },
  })
  const abortRetryer = () => retryer.abort()
  signal.addEventListener('abort', abortRetryer, {once: true})
  try {
    return await retryer.execute()
  } finally {
    signal.removeEventListener('abort', abortRetryer)
  }
}

type StreamControl = {attempt: AbortController | null; reopened: (() => void) | null}

function settleReopened(control: StreamControl): void {
  const reopened = control.reopened
  control.reopened = null
  reopened?.()
}

function stillListening(consumerSignal: AbortSignal | undefined): boolean {
  return !(consumerSignal?.aborted ?? false)
}

function scopedSignal(consumerSignal: AbortSignal | undefined, attempt: AbortController): AbortSignal {
  if (!consumerSignal) return attempt.signal
  return AbortSignal.any([consumerSignal, attempt.signal])
}

type StreamContext = {
  rpc: RpcClient
  sessionId: string
  options: ChatConnectionOptions
  control: StreamControl
  consumerSignal: AbortSignal | undefined
}

function notifyLifecycle(options: ChatConnectionOptions, chunk: StreamChunk): void {
  if (!options.onLifecycle) return
  const lifecycle = runLifecycleOf(chunk)
  if (lifecycle) options.onLifecycle(lifecycle)
}

async function* streamAttempt(context: StreamContext, attempt: AbortController): AsyncGenerator<StreamChunk, boolean> {
  const signal = scopedSignal(context.consumerSignal, attempt)
  const stream = await openStream(context.rpc, context.sessionId, context.options, signal)
  if (!stream) return false
  try {
    for await (const chunk of stream) {
      notifyLifecycle(context.options, chunk)
      yield chunk
      settleReopened(context.control)
    }
    return attempt.signal.aborted
  } catch (error) {
    if (!stillListening(context.consumerSignal)) return false
    if (!attempt.signal.aborted && isReachabilityError(error)) context.options.onRetry?.(error)
    return true
  }
}

async function* subscribeStream(context: StreamContext): AsyncGenerator<StreamChunk> {
  try {
    while (stillListening(context.consumerSignal)) {
      const attempt = new AbortController()
      context.control.attempt = attempt
      const reattach = yield* streamAttempt(context, attempt)
      if (!reattach) return
    }
  } finally {
    settleReopened(context.control)
  }
}

export function chatConnection(rpc: RpcClient, sessionId: string, options: ChatConnectionOptions = {}): ChatConnection {
  const control: StreamControl = {attempt: null, reopened: null}
  return {
    subscribe: (abortSignal) => subscribeStream({rpc, sessionId, options, control, consumerSignal: abortSignal}),
    send: async (messages, _data, abortSignal, runContext) => {
      const runId = runContext?.runId
      if (!runId) throw new Error('chat.send needs the run id the chat client minted for this turn')
      const content = turnContent(messages)
      const messageId = turnMessageId(messages)
      await rpc.chat.send({sessionId, runId, content, messageId}, {signal: abortSignal})
    },
    refresh: async () => {
      const attempt = control.attempt
      if (!attempt) return
      settleReopened(control)
      const reopened = new Promise<void>((resolve) => {
        control.reopened = resolve
      })
      attempt.abort()
      await reopened
    },
  }
}
