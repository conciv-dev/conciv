import type {Page, Request as PageRequest} from 'playwright'
import {rpcObserverFor} from './rpc-observer.js'

const RPC_HTTP_MARKER = '/rpc/'
const RPC_HTTP_ROOT = '/rpc'

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

export function httpRpcRequestUrls(page: Page): {urls: string[]; dispose: () => void} {
  const urls: string[] = []
  const onRequest = (request: PageRequest): void => {
    const pathname = new URL(request.url()).pathname
    if (pathname.startsWith(RPC_HTTP_MARKER) || pathname === RPC_HTTP_ROOT) urls.push(request.url())
  }
  page.on('request', onRequest)
  return {urls, dispose: () => page.off('request', onRequest)}
}
