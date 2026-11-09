import type {Page} from 'playwright'
import {rpcObserverFor} from './rpc-observer.js'

export type RpcCallCursor = {
  startedSince: (path: readonly string[]) => number
  completedSince: (path: readonly string[]) => number
  socketsSince: () => number
}

export function rpcCallCursor(page: Page): RpcCallCursor {
  const observer = rpcObserverFor(page)
  const since = observer.mark()
  const socketsBefore = observer.socketCount()
  return {
    startedSince: (path) => observer.startedCount({path, since}),
    completedSince: (path) => observer.completedCount({path, since}),
    socketsSince: () => observer.socketCount() - socketsBefore,
  }
}

export function rpcCallMark(page: Page): number {
  return rpcObserverFor(page).mark()
}
