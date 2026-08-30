import type {Page, WebSocket as PageWebSocket} from 'playwright'
import {PUSH_WS_PATH} from '@conciv/protocol/push-types'

export type PushWireWatch = {
  opened: () => number
  liveSockets: () => number
}

export function watchPushWire(page: Page): PushWireWatch {
  const sockets = {count: 0, closed: 0}
  const onSocket = (socket: PageWebSocket): void => {
    if (!socket.url().includes(PUSH_WS_PATH)) return
    sockets.count += 1
    socket.on('close', () => {
      sockets.closed += 1
    })
  }
  page.on('websocket', onSocket)
  return {opened: () => sockets.count, liveSockets: () => sockets.count - sockets.closed}
}
