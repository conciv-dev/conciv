import type {Page} from 'playwright'
import {rpcObserverFor, type RpcInputPattern} from './rpc-observer.js'

export type RpcCallCursor = {
  startedSince: (path: readonly string[]) => number
  servedSince: (path: readonly string[], input?: RpcInputPattern) => number
  socketsSince: () => number
}

export function rpcCallCursor(page: Page): RpcCallCursor {
  const observer = rpcObserverFor(page)
  const since = observer.mark()
  const socketsBefore = observer.socketCount()
  return {
    startedSince: (path) => observer.startedCount({path, since}),
    servedSince: (path, input) => observer.completedCount({path, input, since, served: true}),
    socketsSince: () => observer.socketCount() - socketsBefore,
  }
}

export function rpcCallMark(page: Page): number {
  return rpcObserverFor(page).mark()
}
