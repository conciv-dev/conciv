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
