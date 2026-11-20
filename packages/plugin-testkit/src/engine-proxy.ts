import {once} from 'node:events'
import {createServer, request, type IncomingHttpHeaders, type IncomingMessage} from 'node:http'
import {WebSocket, WebSocketServer, type RawData} from 'ws'
import {RPC_WS_PATH} from '@conciv/protocol/rpc-types'
import {disposeAll} from './dispose.js'
import {listenLocal} from './listen-local.js'
import type {ProxyEvent, ProxyFrame, ProxySide} from './engine-process.js'

export type EngineProxy = {
  apiBase: string
  listen: (socket: number) => void
  connect: (socket: number) => void
  send: (side: ProxySide, socket: number, message: ProxyFrame) => void
  closeSocket: (side: ProxySide, socket: number, code?: number, reason?: string) => void
  offline: () => void
  online: () => void
  pause: () => void
  resume: () => void
  close: () => Promise<void>
}

type ProxiedSide = {socket: WebSocket; opened: Promise<void>}

type ProxiedSocket = {page: ProxiedSide; engine: ProxiedSide | undefined; request: IncomingMessage}

const HANDSHAKE_HEADERS: readonly string[] = [
  'host',
  'connection',
  'upgrade',
  'sec-websocket-key',
  'sec-websocket-version',
  'sec-websocket-extensions',
]

function bufferFrom(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data)
  return Buffer.from(data)
}

function frame(data: RawData, isBinary: boolean): ProxyFrame {
  const buffer = bufferFrom(data)
  return isBinary ? buffer : buffer.toString()
}

function forwardedHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([name, value]) =>
      value === undefined || HANDSHAKE_HEADERS.includes(name) ? [] : [[name, [value].flat().join(', ')]],
    ),
  )
}

function closeQuietly(socket: WebSocket, code: number | undefined, reason: string | undefined): void {
  if (socket.readyState === WebSocket.CLOSED) return
  try {
    socket.close(code, reason)
  } catch {
    socket.terminate()
  }
}

function relay(socket: WebSocket, side: ProxySide, id: number, emit: (event: ProxyEvent) => void): void {
  socket.on('message', (data, isBinary) => emit({kind: 'message', side, socket: id, message: frame(data, isBinary)}))
  socket.on('close', (code, reason) => emit({kind: 'closed', side, socket: id, code, reason: reason.toString()}))
  socket.on('error', () => socket.terminate())
}

export async function startEngineProxy(target: string, emit: (event: ProxyEvent) => void): Promise<EngineProxy> {
  const engine = new URL(target)
  const sockets = new Map<number, ProxiedSocket>()
  const state = {offline: false, opened: 0}
  const pages = new WebSocketServer({noServer: true})
  const server = createServer((incoming, outgoing) => {
    if (state.offline) {
      incoming.socket.destroy()
      return
    }
    const forward = request(
      new URL(incoming.url ?? '/', engine),
      {method: incoming.method, headers: incoming.headers},
      (answer) => {
        outgoing.writeHead(answer.statusCode ?? 502, answer.headers)
        answer.pipe(outgoing)
      },
    )
    forward.on('error', () => outgoing.destroy())
    incoming.pipe(forward)
  })
  const listening = await listenLocal(server)
  server.on('upgrade', (incoming, duplex, head) => {
    const url = new URL(incoming.url ?? '/', listening.base)
    if (state.offline || url.pathname !== RPC_WS_PATH) {
      duplex.destroy()
      return
    }
    pages.handleUpgrade(incoming, duplex, head, (page) => {
      state.opened += 1
      const id = state.opened
      page.pause()
      sockets.set(id, {page: {socket: page, opened: Promise.resolve()}, engine: undefined, request: incoming})
      relay(page, 'page', id, emit)
      emit({kind: 'open', socket: id, url: url.href})
    })
  })
  const proxied = (id: number): ProxiedSocket => {
    const entry = sockets.get(id)
    if (!entry) throw new Error(`the engine proxy has no socket ${id}`)
    return entry
  }
  const side = (id: number, which: ProxySide): ProxiedSide => {
    const entry = proxied(id)
    const chosen = which === 'page' ? entry.page : entry.engine
    if (!chosen) throw new Error(`socket ${id} was never connected to the engine`)
    return chosen
  }
  const everySocket = (): WebSocket[] =>
    [...sockets.values()].flatMap((entry) => [entry.page, entry.engine].flatMap((each) => (each ? [each.socket] : [])))
  return {
    apiBase: listening.base,
    listen: (id) => proxied(id).page.socket.resume(),
    connect: (id) => {
      const entry = proxied(id)
      const url = new URL(entry.request.url ?? '/', engine)
      url.protocol = 'ws:'
      const socket = new WebSocket(url, {headers: forwardedHeaders(entry.request.headers)})
      relay(socket, 'engine', id, emit)
      const opened = once(socket, 'open').then(() => undefined)
      opened.catch(() => undefined)
      entry.engine = {socket, opened}
    },
    send: (which, id, message) => {
      const proxiedSide = side(id, which)
      proxiedSide.opened.then(
        () => proxiedSide.socket.send(message),
        () => undefined,
      )
    },
    closeSocket: (which, id, code, reason) => {
      const proxiedSide = side(id, which)
      const close = (): void => closeQuietly(proxiedSide.socket, code, reason)
      proxiedSide.opened.then(close, close)
    },
    offline: () => {
      state.offline = true
      for (const socket of everySocket()) socket.terminate()
    },
    online: () => {
      state.offline = false
    },
    pause: () => {
      for (const socket of everySocket()) socket.pause()
    },
    resume: () => {
      for (const socket of everySocket()) socket.resume()
    },
    close: async () => {
      for (const socket of everySocket()) socket.terminate()
      await disposeAll(
        [
          () => new Promise<void>((resolve, reject) => pages.close((error) => (error ? reject(error) : resolve()))),
          listening.close,
        ],
        'sequential',
        'the engine proxy did not close cleanly',
      )
    },
  }
}
