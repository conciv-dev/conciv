import ReconnectingWebSocket from 'partysocket/ws'
import type {StreamChunk} from '@tanstack/ai'
import {PUSH_SESSION_PARAM, PUSH_WS_PATH, PushFrameSchema, type PushFrame} from '@conciv/protocol/push-types'
import {relayedValues} from './stream-relay.js'

export type PageQueryFrame = {requestId: string; query: unknown}

export type PushChannel = {
  queries: (abortSignal?: AbortSignal) => AsyncGenerator<PageQueryFrame>
  events: (abortSignal?: AbortSignal) => AsyncGenerator<StreamChunk>
  dispose: () => void
}

const MIN_RECONNECT_DELAY_MS = 250
const MAX_RECONNECT_DELAY_MS = 2000
const MIN_UPTIME_MS = 1000
const CONNECTION_TIMEOUT_MS = 2000

export function pushSocketUrl(apiBase: string, sessionId: string): string {
  const origin = typeof window === 'undefined' ? 'http://127.0.0.1' : window.location.href
  const url = new URL(`${apiBase}${PUSH_WS_PATH}`, origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set(PUSH_SESSION_PARAM, sessionId)
  return url.toString()
}

function parsedJson(payload: string): unknown {
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

function decoded(payload: unknown): PushFrame | null {
  if (typeof payload !== 'string') return null
  const parsed = PushFrameSchema.safeParse(parsedJson(payload))
  return parsed.success ? parsed.data : null
}

export type PushChannelOptions = {apiBase: string; sessionId: string}

export function openPushChannel(options: PushChannelOptions): PushChannel {
  const sinks = new Set<(frame: PushFrame) => void>()
  const socket = new ReconnectingWebSocket(() => pushSocketUrl(options.apiBase, options.sessionId), [], {
    minReconnectionDelay: MIN_RECONNECT_DELAY_MS,
    maxReconnectionDelay: MAX_RECONNECT_DELAY_MS,
    minUptime: MIN_UPTIME_MS,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
  })
  socket.addEventListener('message', (event) => {
    const frame = decoded(event.data)
    if (!frame) return
    for (const sink of sinks) sink(frame)
  })
  const subscribe = (sink: (frame: PushFrame) => void): (() => void) => {
    sinks.add(sink)
    return () => {
      sinks.delete(sink)
    }
  }
  return {
    queries: (abortSignal) =>
      relayedValues<PageQueryFrame>(
        (emit) =>
          subscribe((frame) => {
            if (frame.channel === 'page') emit({requestId: frame.requestId, query: frame.query})
          }),
        abortSignal,
      ),
    events: (abortSignal) =>
      relayedValues<StreamChunk>(
        (emit) =>
          subscribe((frame) => {
            if (frame.channel === 'chat') emit(frame.chunk)
          }),
        abortSignal,
      ),
    dispose: () => {
      sinks.clear()
      socket.close()
    },
  }
}

type HeldChannel = {channel: PushChannel; refs: number}

const shared = new Map<string, HeldChannel>()

function releasePushChannel(key: string): void {
  const entry = shared.get(key)
  if (!entry) return
  entry.refs -= 1
  if (entry.refs > 0) return
  shared.delete(key)
  entry.channel.dispose()
}

export function acquirePushChannel(options: PushChannelOptions): PushChannel {
  const key = `${options.apiBase} ${options.sessionId}`
  const entry = shared.get(key) ?? {channel: openPushChannel(options), refs: 0}
  entry.refs += 1
  shared.set(key, entry)
  return {
    queries: (abortSignal) => entry.channel.queries(abortSignal),
    events: (abortSignal) => entry.channel.events(abortSignal),
    dispose: () => releasePushChannel(key),
  }
}

export function livePushChannelCount(): number {
  return shared.size
}
