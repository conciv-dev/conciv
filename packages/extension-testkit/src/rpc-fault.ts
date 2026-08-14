import type {Page, WebSocketRoute} from 'playwright'
import {toHttpPath} from '@orpc/client/standard'
import {encodeResponseMessage, MessageType} from '@orpc/standard-server-peer'
import {decodeRpcFrame} from './rpc-frames.js'

const FAILURE_BODY = {json: {}, meta: []}

export type RpcFaultInjector = {repair: () => void}

export async function failRpcCalls(
  page: Page,
  options: {path: readonly string[]; status?: number},
): Promise<RpcFaultInjector> {
  const status = options.status ?? 500
  const httpPath = toHttpPath(options.path)
  const broken = {value: true}

  await page.route(
    (url) => url.pathname.endsWith(httpPath),
    async (route) => {
      if (!broken.value) return route.continue()
      await route.fulfill({status, contentType: 'application/json', body: JSON.stringify(FAILURE_BODY)})
    },
  )

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

  await page.routeWebSocket((url) => url.pathname.endsWith('/rpc-ws'), holdSocket)

  return {
    repair: () => {
      broken.value = false
    },
  }
}

export type RpcHold = {hold: () => void; release: () => void}

export async function holdRpcCalls(page: Page): Promise<RpcHold> {
  const held = {value: false}
  const sockets = new Set<WebSocketRoute>()

  await page.route(
    (url) => url.pathname.startsWith('/rpc/') || url.pathname === '/rpc',
    async (route) => {
      if (!held.value) return route.continue()
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
