import {EventType, type ModelMessage, type StreamChunk, type UIMessage} from '@tanstack/ai'
import type {SubscribeConnectionAdapter} from '@tanstack/ai-solid'
import {AsyncRetryer} from '@tanstack/pacer'
import type {RpcClient} from '@conciv/contract'
import type {ChatContentPart} from '@conciv/protocol/chat-types'

export type ChatConnectionOptions = {
  retryDelayMs?: number
  busyTimeoutMs?: number
  onRetry?: (error: unknown) => void
}

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

type ChunkSink = (chunks: StreamChunk[]) => void

type SessionBridge = {
  connect: (sink: ChunkSink) => void
  sendPending: () => void
  sendAccepted: (runId: string) => void
  sendFailed: () => void
  deliver: (chunk: StreamChunk) => StreamChunk[]
}

function runIdOf(chunk: StreamChunk): string | undefined {
  return 'runId' in chunk && typeof chunk.runId === 'string' ? chunk.runId : undefined
}

function sessionBridge(): SessionBridge {
  let mode: 'idle' | 'pending' | 'accepted' = 'idle'
  let ownRunId: string | undefined
  let held: StreamChunk[] = []
  let sink: ChunkSink = () => {}

  const takeHeld = (): StreamChunk[] => {
    const chunks = held
    held = []
    mode = 'idle'
    ownRunId = undefined
    return chunks
  }
  const isOwnTerminal = (chunk: StreamChunk): boolean =>
    mode === 'accepted' &&
    (chunk.type === EventType.RUN_FINISHED || chunk.type === EventType.RUN_ERROR) &&
    runIdOf(chunk) === ownRunId

  return {
    connect: (nextSink) => {
      held = []
      sink = nextSink
    },
    sendPending: () => {
      mode = 'pending'
      ownRunId = undefined
    },
    sendAccepted: (runId) => {
      mode = 'accepted'
      ownRunId = runId
      if (held.some((chunk) => runIdOf(chunk) === runId)) sink(takeHeld())
    },
    sendFailed: () => {
      sink(takeHeld())
    },
    deliver: (chunk) => {
      if (mode === 'idle') return [chunk]
      if (isOwnTerminal(chunk)) return [chunk, ...takeHeld()]
      if (mode === 'accepted' && chunk.type === EventType.RUN_STARTED && runIdOf(chunk) !== ownRunId) {
        return [...takeHeld(), chunk]
      }
      if (chunk.type === EventType.RUN_FINISHED) {
        held.push(chunk)
        return []
      }
      return [chunk]
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

function busySendRetryer(
  rpc: RpcClient,
  input: Parameters<RpcClient['chat']['send']>[0],
  options: ChatConnectionOptions,
  signal: AbortSignal | undefined,
): AsyncRetryer<() => Promise<{ok: true; runId: string}>> {
  const startedAt = Date.now()
  const delayMs = options.retryDelayMs ?? 500
  const withinBudget = () =>
    options.busyTimeoutMs === undefined || Date.now() - startedAt + delayMs <= options.busyTimeoutMs
  return new AsyncRetryer(async () => await rpc.chat.send(input, {signal}), {
    backoff: 'fixed',
    baseWait: delayMs,
    maxAttempts: (retryer) => {
      const state = retryer.store.state
      const retriable = isBusyError(state.lastError) && !aborted(signal) && withinBudget()
      return retriable ? Number.MAX_SAFE_INTEGER : Math.max(state.currentAttempt, 1)
    },
    onRetry: (_attempt, error) => options.onRetry?.(error),
  })
}

async function sendWhenAvailable(
  rpc: RpcClient,
  input: Parameters<RpcClient['chat']['send']>[0],
  options: ChatConnectionOptions,
  bridge: SessionBridge,
  signal: AbortSignal | undefined,
): Promise<void> {
  bridge.sendPending()
  const retryer = busySendRetryer(rpc, input, options, signal)
  const abortRetryer = () => retryer.abort()
  signal?.addEventListener('abort', abortRetryer, {once: true})
  try {
    const accepted = await retryer.execute()
    signal?.throwIfAborted()
    if (!accepted) throw new Error('chat.send settled without a response')
    bridge.sendAccepted(accepted.runId)
  } catch (error) {
    bridge.sendFailed()
    throw error
  } finally {
    signal?.removeEventListener('abort', abortRetryer)
  }
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
  const buffer: StreamChunk[] = []
  const state: {done: boolean; wake: (() => void) | null} = {done: false, wake: null}
  const push = (chunks: StreamChunk[]) => {
    if (chunks.length === 0) return
    buffer.push(...chunks)
    state.wake?.()
  }
  bridge.connect(push)
  const pump = async () => {
    for await (const chunk of attachLoop(rpc, sessionId, options, signal)) {
      push(bridge.deliver(chunk))
    }
  }
  const pumping = pump().finally(() => {
    state.done = true
    state.wake?.()
  })
  while (!state.done || buffer.length > 0) {
    const next = buffer.shift()
    if (next) {
      yield next
      continue
    }
    await new Promise<void>((resolve) => {
      state.wake = resolve
    })
    state.wake = null
  }
  await pumping
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
