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
const NORMAL_CLOSE_CODE = 1000
const APPLICATION_CLOSE_MIN = 3000
const APPLICATION_CLOSE_MAX = 4999
const FAILURE_BODY = {json: {}, meta: []}
const GARBLED_BODY = {json: {}, meta: [[0, 'value']]}

const serializer = new StandardRPCSerializer(new StandardRPCJsonSerializer())

type Message = string | Buffer

export type RpcSocketCall = {
  path: readonly string[]
  input: unknown
  forward: () => void
  reply: (status: number) => Promise<void>
  garble: () => Promise<void>
  cut: () => void
}

export type RpcSocketVerdict = 'handled' | 'pass'

export type RpcSocketRule = (call: RpcSocketCall) => RpcSocketVerdict

export type RpcSocketEvent =
  | {kind: 'request'; requestId: string; path: readonly string[]; input: unknown}
  | {kind: 'response'; requestId: string; status: number; served: boolean}

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
  const server = route.connectToServer()
  const outbound = {tail: Promise.resolve()}
  const inbound = {tail: Promise.resolve()}
  const emit = (event: RpcSocketEvent): void => {
    for (const listener of state.listeners) listener(event)
  }
  route.onClose((code, reason) => {
    state.live.delete(route)
    outbound.tail = outbound.tail
      .then(() => server.close(forwardableClose(code, reason)))
      .catch((error: unknown) => console.error('[extension-testkit] a page close could not reach the engine', error))
  })
  route.onMessage((message) => {
    outbound.tail = outbound.tail
      .then(() => sendOutbound(message, socketId, {route, forward: () => server.send(message), state, emit}))
      .catch((error: unknown) => console.error('[extension-testkit] an rpc frame could not be routed', error))
  })
  server.onMessage((message) => {
    inbound.tail = inbound.tail
      .then(() => observeInbound(message, socketId, emit))
      .catch((error: unknown) => console.error('[extension-testkit] an rpc reply could not be decoded', error))
      .then(() => route.send(message))
  })
}

function forwardableClose(code: number | undefined, reason: string | undefined): {code?: number; reason?: string} {
  if (
    code === undefined ||
    (code !== NORMAL_CLOSE_CODE && (code < APPLICATION_CLOSE_MIN || code > APPLICATION_CLOSE_MAX))
  ) {
    return {}
  }
  return reason === undefined ? {code} : {code, reason}
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
  const input = serializer.deserialize(payload.body)
  outbound.emit({kind: 'request', requestId, path, input})
  const call: RpcSocketCall = {
    path,
    input,
    forward: outbound.forward,
    reply: (status) => injectReply(outbound, id, requestId, status, FAILURE_BODY),
    garble: () => injectReply(outbound, id, requestId, 200, GARBLED_BODY),
    cut: () => void outbound.route.close({code: CUT_CLOSE_CODE}),
  }
  if (outbound.state.rules.some((rule) => rule(call) === 'handled')) return
  outbound.forward()
}

async function injectReply(
  outbound: Outbound,
  id: string,
  requestId: string,
  status: number,
  body: typeof FAILURE_BODY | typeof GARBLED_BODY,
): Promise<void> {
  const frame = await encodeResponseMessage(id, MessageType.RESPONSE, {status, headers: {}, body})
  if (typeof frame !== 'string') throw new Error('the injected rpc reply frame encoded to binary')
  outbound.emit({kind: 'response', requestId, status, served: false})
  outbound.route.send(frame)
}

async function observeInbound(message: Message, socketId: string, emit: (event: RpcSocketEvent) => void) {
  const decoded = await decodeResponseMessage(message).catch(() => null)
  if (decoded === null || decoded[1] !== MessageType.RESPONSE) return
  const [id, , payload] = decoded
  emit({kind: 'response', requestId: `${socketId}:${id}`, status: payload.status, served: true})
}
