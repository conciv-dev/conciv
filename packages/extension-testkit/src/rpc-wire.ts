import type {Page} from 'playwright'
import {rpcObserverFor, type RpcTransport} from './rpc-observer.js'

export type {RpcTransport}

const WIRE_TIMEOUT_MS = 30_000
const SESSIONS_BOOT_LIST_TIMEOUT_MS = 5_000
const SESSIONS_BOOT_RESOLVE_TIMEOUT_MS = 1_500

const SESSIONS_LIST: readonly string[] = ['sessions', 'list']
const SESSIONS_RESOLVE: readonly string[] = ['sessions', 'resolve']

export type RpcWireWatch = {
  sessionsBootTraffic: () => Promise<void>
  sessionsResolvedSince: (since: number) => Promise<number | null>
  sessionsListedSince: (since: number) => Promise<number | null>
}

export function watchRpcWire(page: Page): RpcWireWatch {
  const observer = rpcObserverFor(page)
  const answeredSince = (path: readonly string[], since: number): Promise<number | null> =>
    observer.completed({path, since, timeout: WIRE_TIMEOUT_MS}).then((call) => call.status)

  return {
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
