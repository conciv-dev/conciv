import type {ModelMessage, StreamChunk, UIMessage} from '@tanstack/ai'
import type {SubscribeConnectionAdapter} from '@tanstack/ai-solid'
import type {RpcClient} from '@conciv/contract'

export type ChatConnectionOptions = {retryDelayMs?: number; onRetry?: (error: unknown) => void}

function textOf(message: UIMessage | ModelMessage): string {
  if ('parts' in message) {
    return message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join('\n')
  }
  return typeof message.content === 'string' ? message.content : ''
}

function lastUserText(messages: Array<UIMessage> | Array<ModelMessage>): string {
  const last = messages[messages.length - 1]
  return last ? textOf(last) : ''
}

function aborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false
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

export function chatConnection(
  rpc: RpcClient,
  sessionId: string,
  options: ChatConnectionOptions = {},
): SubscribeConnectionAdapter {
  return {
    subscribe: (abortSignal) => attachLoop(rpc, sessionId, options, abortSignal),
    send: async (messages, _data, abortSignal) => {
      await rpc.chat.send({sessionId, text: lastUserText(messages)}, {signal: abortSignal})
    },
  }
}
