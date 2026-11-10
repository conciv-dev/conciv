import type {Page, WebSocketRoute} from 'playwright'
import {StandardRPCJsonSerializer, StandardRPCSerializer} from '@orpc/client/standard'
import {
  decodeRequestMessage,
  decodeResponseMessage,
  encodeResponseMessage,
  MessageType,
} from '@orpc/standard-server-peer'
import {RPC_WS_PATH} from '@conciv/protocol/rpc-types'

const CUT_CLOSE_CODE = 1011
const FAILURE_BODY = {json: {}, meta: []}

const serializer = new StandardRPCSerializer(new StandardRPCJsonSerializer())

type Message = string | Buffer

export type RpcSocketCall = {
  path: readonly string[]
  forward: () => void
  reply: (status: number) => Promise<void>
  cut: () => void
}

export type RpcSocketVerdict = 'handled' | 'pass'

export type RpcSocketRule = (call: RpcSocketCall) => RpcSocketVerdict

export type RpcSocketEvent =
  | {kind: 'request'; requestId: string; path: readonly string[]; input: unknown}
  | {kind: 'response'; requestId: string; status: number}

export type RpcSocketListener = (event: RpcSocketEvent) => void

export type RpcSocket = {
  installed: Promise<void>
  rule: (rule: RpcSocketRule) => () => void
  listen: (listener: RpcSocketListener) => () => void
  opened: () => number
  hold: () => void
  release: () => void
}

type SocketState = {
  rules: RpcSocketRule[]
  listeners: Set<RpcSocketListener>
  live: Set<WebSocketRoute>
  opened: number
  held: boolean
}

const sockets = new WeakMap<Page, RpcSocket>()

export function rpcSocketFor(page: Page): RpcSocket {
  const existing = sockets.get(page)
  if (existing) return existing
  const state: SocketState = {rules: [], listeners: new Set(), live: new Set(), opened: 0, held: false}
  const installed = page.routeWebSocket(
    (url) => url.pathname.endsWith(RPC_WS_PATH),
    (route) => connect(route, state),
  )
  installed.catch(() => undefined)
  const created: RpcSocket = {
    installed,
    rule: (rule) => {
      state.rules.unshift(rule)
      return () => {
        state.rules = state.rules.filter((entry) => entry !== rule)
      }
    },
    listen: (listener) => {
      state.listeners.add(listener)
      return () => {
        state.listeners.delete(listener)
      }
    },
    opened: () => state.opened,
    hold: () => {
      state.held = true
      for (const route of state.live) void route.close({code: CUT_CLOSE_CODE})
      state.live.clear()
    },
    release: () => {
      state.held = false
    },
  }
  sockets.set(page, created)
  return created
}

function connect(route: WebSocketRoute, state: SocketState): void {
  if (state.held) {
    void route.close({code: CUT_CLOSE_CODE})
    return
  }
  state.opened += 1
  const socketId = `ws-${state.opened}`
  state.live.add(route)
  route.onClose(() => state.live.delete(route))
  const server = route.connectToServer()
  const outbound = {tail: Promise.resolve()}
  const inbound = {tail: Promise.resolve()}
  const emit = (event: RpcSocketEvent): void => {
    for (const listener of state.listeners) listener(event)
  }
  route.onMessage((message) => {
    outbound.tail = outbound.tail
      .then(() => sendOutbound(message, socketId, {route, forward: () => server.send(message), state, emit}))
      .catch((error: unknown) => console.error('[extension-testkit] an rpc frame could not be routed', error))
  })
  server.onMessage((message) => {
    route.send(message)
    inbound.tail = inbound.tail
      .then(() => observeInbound(message, socketId, emit))
      .catch((error: unknown) => console.error('[extension-testkit] an rpc reply could not be decoded', error))
  })
}

type Outbound = {
  route: WebSocketRoute
  forward: () => void
  state: SocketState
  emit: (event: RpcSocketEvent) => void
}

async function sendOutbound(message: Message, socketId: string, outbound: Outbound): Promise<void> {
  const decoded = await decodeRequestMessage(message).catch(() => null)
  if (decoded === null || decoded[1] !== MessageType.REQUEST) {
    outbound.forward()
    return
  }
  const [id, , payload] = decoded
  const requestId = `${socketId}:${id}`
  const path = payload.url.pathname
    .split('/')
    .filter((segment) => segment !== '')
    .map(decodeURIComponent)
  outbound.emit({kind: 'request', requestId, path, input: serializer.deserialize(payload.body)})
  const call: RpcSocketCall = {
    path,
    forward: outbound.forward,
    reply: async (status) => {
      const failure = await encodeResponseMessage(id, MessageType.RESPONSE, {status, headers: {}, body: FAILURE_BODY})
      if (typeof failure !== 'string') throw new Error('the injected rpc failure frame encoded to binary')
      outbound.route.send(failure)
      outbound.emit({kind: 'response', requestId, status})
    },
    cut: () => void outbound.route.close({code: CUT_CLOSE_CODE}),
  }
  if (outbound.state.rules.some((rule) => rule(call) === 'handled')) return
  outbound.forward()
}

async function observeInbound(message: Message, socketId: string, emit: (event: RpcSocketEvent) => void) {
  const decoded = await decodeResponseMessage(message).catch(() => null)
  if (decoded === null || decoded[1] !== MessageType.RESPONSE) return
  const [id, , payload] = decoded
  emit({kind: 'response', requestId: `${socketId}:${id}`, status: payload.status})
}
