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
  | {kind: 'response'; requestId: string; status: number; served: boolean; output: unknown}
  | {kind: 'abort'; requestId: string}

export type RpcSocketListener = (event: RpcSocketEvent) => void

export type RpcSocket = {
  installed: Promise<void>
  rule: (rule: RpcSocketRule) => () => void
  listen: (listener: RpcSocketListener) => () => void
  opened: () => number
  liveSockets: () => number
  awaitLive: () => Promise<void>
  engineCloses: (code: number) => number
  awaitEngineCloses: (code: number, count: number) => Promise<void>
  hold: () => Promise<void>
  release: () => void
  holdCloses: () => void
  releaseCloses: () => void
  holdHandshakes: () => void
  releaseHandshakes: () => void
  heldHandshakes: () => number
  awaitHandshakes: (count: number) => Promise<void>
}

type HandshakeWaiter = {count: number; deliver: () => void}

type CloseWaiter = {code: number; count: number; deliver: () => void}

type SocketState = {
  rules: RpcSocketRule[]
  listeners: Set<RpcSocketListener>
  live: Set<WebSocketRoute>
  speaking: Set<WebSocketRoute>
  speakingWaiters: (() => void)[]
  engineCloseCodes: number[]
  closeWaiters: CloseWaiter[]
  opened: number
  held: boolean
  heldCloses: (() => void)[] | null
  heldHandshakes: (() => void)[] | null
  handshakesSinceHold: number
  handshakeWaiters: HandshakeWaiter[]
}

const sockets = new WeakMap<Page, RpcSocket>()

export function rpcSocketFor(page: Page): RpcSocket {
  const existing = sockets.get(page)
  if (existing) return existing
  const state: SocketState = {
    rules: [],
    listeners: new Set(),
    live: new Set(),
    speaking: new Set(),
    speakingWaiters: [],
    engineCloseCodes: [],
    closeWaiters: [],
    opened: 0,
    held: false,
    heldCloses: null,
    heldHandshakes: null,
    handshakesSinceHold: 0,
    handshakeWaiters: [],
  }
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
    liveSockets: () => state.speaking.size,
    awaitLive: () =>
      state.speaking.size > 0 ? Promise.resolve() : new Promise((resolve) => state.speakingWaiters.push(resolve)),
    engineCloses: (code) => engineCloseCount(state, code),
    awaitEngineCloses: (code, count) =>
      engineCloseCount(state, code) >= count
        ? Promise.resolve()
        : new Promise((resolve) => state.closeWaiters.push({code, count, deliver: resolve})),
    hold: async () => {
      state.held = true
      const closing = [...state.live].map((route) => route.close({code: CUT_CLOSE_CODE}))
      state.live.clear()
      state.speaking.clear()
      await Promise.all(closing)
    },
    release: () => {
      state.held = false
    },
    holdCloses: () => {
      state.heldCloses ??= []
    },
    releaseCloses: () => {
      const held = state.heldCloses ?? []
      state.heldCloses = null
      for (const close of held) close()
    },
    holdHandshakes: () => {
      state.heldHandshakes ??= []
      state.handshakesSinceHold = 0
    },
    releaseHandshakes: () => {
      const held = state.heldHandshakes ?? []
      state.heldHandshakes = null
      for (const open of held) open()
    },
    heldHandshakes: () => state.handshakesSinceHold,
    awaitHandshakes: (count) =>
      state.handshakesSinceHold >= count
        ? Promise.resolve()
        : new Promise((resolve) => state.handshakeWaiters.push({count, deliver: resolve})),
  }
  sockets.set(page, created)
  return created
}

function heldHandshake(state: SocketState): Promise<void> {
  const held = state.heldHandshakes
  if (held === null) return Promise.resolve()
  state.handshakesSinceHold += 1
  const reached = state.handshakeWaiters.filter((waiter) => state.handshakesSinceHold >= waiter.count)
  state.handshakeWaiters = state.handshakeWaiters.filter((waiter) => !reached.includes(waiter))
  for (const waiter of reached) waiter.deliver()
  return new Promise((resolve) => held.push(resolve))
}

async function connect(route: WebSocketRoute, state: SocketState): Promise<void> {
  if (state.held) {
    void route.close({code: CUT_CLOSE_CODE})
    return
  }
  await heldHandshake(state)
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
    state.speaking.delete(route)
    outbound.tail = outbound.tail
      .then(() => server.close(forwardableClose(code, reason)))
      .catch((error: unknown) => console.error('[plugin-testkit] a page close could not reach the engine', error))
  })
  route.onMessage((message) => {
    speaks(route, state)
    outbound.tail = outbound.tail
      .then(() => sendOutbound(message, socketId, {route, forward: () => server.send(message), state, emit}))
      .catch((error: unknown) => console.error('[plugin-testkit] an rpc frame could not be routed', error))
  })
  server.onClose((code, reason) => {
    state.speaking.delete(route)
    engineClosed(state, code)
    const close = (): void => void route.close({code, reason})
    if (state.heldCloses === null) close()
    else state.heldCloses.push(close)
  })
  server.onMessage((message) => {
    inbound.tail = inbound.tail
      .then(() => observeInbound(message, socketId, emit))
      .catch((error: unknown) => console.error('[plugin-testkit] an rpc reply could not be decoded', error))
      .then(() => route.send(message))
  })
}

function engineCloseCount(state: SocketState, code: number): number {
  return state.engineCloseCodes.filter((closed) => closed === code).length
}

function engineClosed(state: SocketState, code: number | undefined): void {
  if (code === undefined) return
  state.engineCloseCodes.push(code)
  const reached = state.closeWaiters.filter((waiter) => engineCloseCount(state, waiter.code) >= waiter.count)
  state.closeWaiters = state.closeWaiters.filter((waiter) => !reached.includes(waiter))
  for (const waiter of reached) waiter.deliver()
}

function speaks(route: WebSocketRoute, state: SocketState): void {
  if (state.speaking.has(route)) return
  state.speaking.add(route)
  for (const deliver of state.speakingWaiters.splice(0)) deliver()
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
  if (decoded !== null && decoded[1] === MessageType.ABORT_SIGNAL) {
    outbound.emit({kind: 'abort', requestId: `${socketId}:${decoded[0]}`})
  }
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
  outbound.emit({kind: 'response', requestId, status, served: false, output: undefined})
  outbound.route.send(frame)
}

async function observeInbound(message: Message, socketId: string, emit: (event: RpcSocketEvent) => void) {
  const decoded = await decodeResponseMessage(message).catch(() => null)
  if (decoded === null || decoded[1] !== MessageType.RESPONSE) return
  const [id, , payload] = decoded
  emit({
    kind: 'response',
    requestId: `${socketId}:${id}`,
    status: payload.status,
    served: true,
    output: serializer.deserialize(payload.body),
  })
}
