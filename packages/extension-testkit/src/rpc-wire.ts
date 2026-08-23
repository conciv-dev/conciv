import type {Page} from 'playwright'
import type {z} from 'zod'
import {ChatSendInput} from '@conciv/contract'
import {rpcObserverFor, type RpcTransport} from './rpc-observer.js'

export type {RpcTransport}

const WIRE_TIMEOUT_MS = 30_000
const SESSIONS_BOOT_LIST_TIMEOUT_MS = 5_000
const SESSIONS_BOOT_RESOLVE_TIMEOUT_MS = 1_500

const CHAT_SEND: readonly string[] = ['chat', 'send']
const CHAT_SUBSCRIBE: readonly string[] = ['chat', 'subscribe']
const SESSIONS_LIST: readonly string[] = ['sessions', 'list']
const SESSIONS_RESOLVE: readonly string[] = ['sessions', 'resolve']

export type ChatSendFrame = {transport: RpcTransport} & z.infer<typeof ChatSendInput>

export type ChatReconnectFrames = {send: RpcTransport; subscribe: RpcTransport}

export type RpcWireWatch = {
  nextChatSend: () => Promise<ChatSendFrame>
  chatReconnect: () => Promise<ChatReconnectFrames>
  sessionsBootTraffic: () => Promise<void>
  sessionsResolvedSince: (since: number) => Promise<number | null>
  sessionsListedSince: (since: number) => Promise<number | null>
}

export function watchRpcWire(page: Page): RpcWireWatch {
  const observer = rpcObserverFor(page)
  const answeredSince = (path: readonly string[], since: number): Promise<number | null> =>
    observer.completed({path, since, timeout: WIRE_TIMEOUT_MS}).then((call) => call.status)

  return {
    nextChatSend: () => {
      const since = observer.mark()
      return observer
        .completed({path: CHAT_SEND, since, timeout: WIRE_TIMEOUT_MS})
        .then((call) => ({transport: call.transport, ...ChatSendInput.parse(call.input)}))
    },
    chatReconnect: async () => {
      const since = observer.mark()
      const transportOf = (path: readonly string[]): Promise<RpcTransport> =>
        observer.completed({path, since, timeout: WIRE_TIMEOUT_MS}).then((call) => call.transport)
      const [send, subscribe] = await Promise.all([transportOf(CHAT_SEND), transportOf(CHAT_SUBSCRIBE)])
      return {send, subscribe}
    },
    sessionsBootTraffic: async () => {
      await observer.completed({path: SESSIONS_LIST, timeout: SESSIONS_BOOT_LIST_TIMEOUT_MS})
      await observer
        .completed({path: SESSIONS_RESOLVE, timeout: SESSIONS_BOOT_RESOLVE_TIMEOUT_MS})
        .catch(() => undefined)
    },
    sessionsResolvedSince: (since) => answeredSince(SESSIONS_RESOLVE, since),
    sessionsListedSince: (since) => answeredSince(SESSIONS_LIST, since),
  }
}
