import type {MiddlewareHandler} from 'hono'

export type SocketSink = {send: (data: string) => void; close: (code?: number, reason?: string) => void}

export type SocketHandlers = {
  onOpen: (event: unknown, ws: SocketSink) => void
  onMessage: (event: {data: unknown}, ws: SocketSink) => void
  onClose: () => void
  onError: () => void
}

export type UpgradeWebSocket = (handler: (c: {req: {raw: Request}}) => SocketHandlers) => MiddlewareHandler
