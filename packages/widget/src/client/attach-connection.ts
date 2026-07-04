import type {StreamChunk} from '@tanstack/ai'
import type {RunAgentInputContext, SubscribeConnectionAdapter, UIMessage} from '@tanstack/ai-client'
import type {ModelMessage} from '@tanstack/ai/client'
import {apiError, type SessionClient} from '@conciv/api-client'

const DEFAULT_RETRY_MS = 500

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, {once: true})
  })
}

async function* parseSseChunks(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  try {
    while (!signal?.aborted) {
      const {value, done} = await reader.read()
      if (done) return
      buffered += decoder.decode(value, {stream: true})
      const events = buffered.split('\n\n')
      buffered = events.pop() ?? ''
      for (const event of events) {
        const data = event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (data) yield JSON.parse(data) as StreamChunk
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export function attachConnection(
  client: SessionClient,
  opts: {retryDelayMs?: number} = {},
): SubscribeConnectionAdapter & {bump: () => void} {
  const retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_MS
  const current = {controller: null as AbortController | null}

  async function send(
    messages: Array<UIMessage> | Array<ModelMessage>,
    data?: Record<string, unknown>,
    signal?: AbortSignal,
    runContext?: RunAgentInputContext,
  ): Promise<void> {
    const response = await fetch(client.chatStreamUrl(), {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: {'content-type': 'application/json', ...client.chatHeaders()},
      body: JSON.stringify({messages, forwardedProps: {...runContext?.forwardedProps, ...data}}),
    })
    if (!response.ok) throw apiError('/api/chat', response.status)
  }

  async function* subscribe(signal?: AbortSignal): AsyncGenerator<StreamChunk> {
    while (!signal?.aborted) {
      const controller = new AbortController()
      current.controller = controller
      const onOuterAbort = () => controller.abort()
      signal?.addEventListener('abort', onOuterAbort, {once: true})
      try {
        const response = await fetch(client.attachUrl(), {
          credentials: 'include',
          signal: controller.signal,
          headers: client.chatHeaders(),
        })
        if (response.ok && response.body) yield* parseSseChunks(response.body, controller.signal)
      } catch {
      } finally {
        signal?.removeEventListener('abort', onOuterAbort)
        current.controller = null
      }
      if (signal?.aborted) return
      await delay(retryDelayMs, signal)
    }
  }

  return {send, subscribe, bump: () => current.controller?.abort()}
}
