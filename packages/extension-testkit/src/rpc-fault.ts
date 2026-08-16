import type {Page, Route, WebSocketRoute} from 'playwright'
import {toHttpPath} from '@orpc/client/standard'
import {encodeResponseMessage, MessageType} from '@orpc/standard-server-peer'
import {decodeRpcFrame} from './rpc-frames.js'
import {rpcObserverFor} from './rpc-observer.js'

const FAILURE_BODY = {json: {}, meta: []}

const RPC_PREFIX = '/rpc'

const ANSWER_TIMEOUT_MS = 15_000
const RELEASED_GATE_STATUS = 200

type UrlMatcher = (url: URL) => boolean
type RouteHandler = (route: Route) => Promise<void>

export type RpcFaultInjector = {repair: () => void; dispose: () => Promise<void>; answered: () => Promise<void>}

function answeredBy(page: Page, path: readonly string[] | undefined, status: number): () => Promise<void> {
  const since = rpcObserverFor(page).mark()
  return () => {
    if (!path) {
      return Promise.reject(new Error('this fault matches every rpc path, so it has no single call to await'))
    }
    return rpcObserverFor(page)
      .completed({path, status, since, timeout: ANSWER_TIMEOUT_MS})
      .then(() => undefined)
  }
}

function pathMatcher(path: readonly string[] | undefined): UrlMatcher {
  if (!path) return (url) => url.pathname === RPC_PREFIX || url.pathname.startsWith(`${RPC_PREFIX}/`)
  const httpPath = toHttpPath(path)
  return (url) => url.pathname.endsWith(httpPath)
}

function isPreflight(route: Route): boolean {
  return route.request().method() === 'OPTIONS'
}

export async function failRpcCalls(
  page: Page,
  options: {path: readonly string[]; status?: number; websocket?: boolean},
): Promise<RpcFaultInjector> {
  const status = options.status ?? 500
  const broken = {value: true}
  const matcher = pathMatcher(options.path)
  const answered = answeredBy(page, options.path, status)
  const handler: RouteHandler = async (route) => {
    if (isPreflight(route) || !broken.value) return route.continue()
    await route.fulfill({status, contentType: 'application/json', body: JSON.stringify(FAILURE_BODY)})
  }

  await page.route(matcher, handler)

  const holdSocket = (socket: WebSocketRoute): void => {
    const server = socket.connectToServer()
    const outbound = {tail: Promise.resolve()}
    socket.onMessage((message) => {
      outbound.tail = outbound.tail.then(async () => {
        const frame = await decodeRpcFrame(message, 'outbound')
        if (!broken.value || frame.phase !== 'request' || frame.procedurePath.join('/') !== options.path.join('/')) {
          server.send(message)
          return
        }
        const failure = await encodeResponseMessage(frame.requestId, MessageType.RESPONSE, {
          status,
          headers: {},
          body: FAILURE_BODY,
        })
        if (typeof failure !== 'string') throw new Error('the injected rpc failure frame encoded to binary')
        socket.send(failure)
      })
    })
    server.onMessage((message) => socket.send(message))
  }

  if (options.websocket) await page.routeWebSocket((url) => url.pathname.endsWith('/rpc-ws'), holdSocket)

  return {
    answered,
    repair: () => {
      broken.value = false
    },
    dispose: async () => {
      broken.value = false
      await page.unroute(matcher, handler)
    },
  }
}

export async function abortRpcCalls(page: Page, options: {path?: readonly string[]} = {}): Promise<RpcFaultInjector> {
  const broken = {value: true}
  const matcher = pathMatcher(options.path)
  const answered = (): Promise<void> =>
    Promise.reject(new Error('an aborted rpc call never reaches the server, so it is never answered'))
  const handler: RouteHandler = async (route) => {
    if (isPreflight(route) || !broken.value) return route.continue()
    await route.abort('connectionrefused')
  }

  await page.route(matcher, handler)

  return {
    answered,
    repair: () => {
      broken.value = false
    },
    dispose: async () => {
      broken.value = false
      await page.unroute(matcher, handler)
    },
  }
}

export type RpcHold = {hold: () => void; release: () => void}

export async function holdRpcCalls(page: Page): Promise<RpcHold> {
  const held = {value: false}
  const sockets = new Set<WebSocketRoute>()

  await page.route(
    (url) => url.pathname.startsWith('/rpc/') || url.pathname === RPC_PREFIX,
    async (route) => {
      if (isPreflight(route) || !held.value) return route.continue()
      await route.abort('connectionrefused')
    },
  )

  await page.routeWebSocket(
    (url) => url.pathname.endsWith('/rpc-ws'),
    (socket) => {
      if (held.value) {
        void socket.close()
        return
      }
      sockets.add(socket)
      socket.onClose(() => sockets.delete(socket))
      const server = socket.connectToServer()
      socket.onMessage((message) => server.send(message))
      server.onMessage((message) => socket.send(message))
    },
  )

  return {
    hold: () => {
      held.value = true
      for (const socket of sockets) void socket.close()
      sockets.clear()
    },
    release: () => {
      held.value = false
    },
  }
}

export type RpcGate = {
  pending: () => number
  awaitCaptured: (count: number) => Promise<void>
  answered: () => Promise<void>
  release: () => Promise<void>
  dispose: () => Promise<void>
}

type CaptureWaiter = {count: number; deliver: () => void}

export async function gateRpcCalls(page: Page, options: {path?: readonly string[]} = {}): Promise<RpcGate> {
  const matcher = pathMatcher(options.path)
  const answered = answeredBy(page, options.path, RELEASED_GATE_STATUS)
  const open = {value: false}
  const captured: Route[] = []
  const waiters = new Set<CaptureWaiter>()
  const handler: RouteHandler = async (route) => {
    if (isPreflight(route) || open.value) return route.continue()
    captured.push(route)
    for (const waiter of waiters) {
      if (captured.length < waiter.count) continue
      waiters.delete(waiter)
      waiter.deliver()
    }
  }

  await page.route(matcher, handler)

  const settle = async (): Promise<void> => {
    const pending = captured.splice(0)
    await Promise.all(pending.map((route) => route.continue().catch(() => {})))
  }

  return {
    answered,
    pending: () => captured.length,
    awaitCaptured: (count) => {
      if (captured.length >= count) return Promise.resolve()
      return new Promise<void>((resolve) => {
        waiters.add({count, deliver: resolve})
      })
    },
    release: async () => {
      open.value = true
      await settle()
    },
    dispose: async () => {
      open.value = true
      await settle()
      await page.unroute(matcher, handler)
    },
  }
}
