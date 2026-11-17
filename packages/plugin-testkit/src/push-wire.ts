import type {Page, WebSocket as PageWebSocket} from 'playwright'
import {approvalIds} from '@conciv/harness-testkit'
import {PUSH_WS_PATH, PushFrameSchema} from '@conciv/protocol/push-types'

export type PushWireWatch = {
  opened: () => number
  liveSockets: () => number
  awaitLive: () => Promise<void>
  approvalIdsPushed: () => readonly string[]
}

function parsedJson(payload: string): unknown {
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

function approvalsIn(payload: string): string[] {
  const frame = PushFrameSchema.safeParse(parsedJson(payload))
  if (!frame.success || frame.data.channel !== 'chat') return []
  return approvalIds(frame.data.chunk)
}

export function watchPushWire(page: Page): PushWireWatch {
  const sockets = {requested: 0, live: 0}
  const approvals: string[] = []
  const liveWaiters: (() => void)[] = []
  const onSocket = (socket: PageWebSocket): void => {
    if (!socket.url().includes(PUSH_WS_PATH)) return
    sockets.requested += 1
    socket.once('framesent', () => {
      sockets.live += 1
      for (const deliver of liveWaiters.splice(0)) deliver()
      socket.once('close', () => {
        sockets.live -= 1
      })
    })
    socket.on('framereceived', (event) => {
      approvals.push(...approvalsIn(String(event.payload)))
    })
  }
  page.on('websocket', onSocket)
  return {
    opened: () => sockets.requested,
    liveSockets: () => sockets.live,
    awaitLive: () => (sockets.live > 0 ? Promise.resolve() : new Promise((resolve) => liveWaiters.push(resolve))),
    approvalIdsPushed: () => approvals,
  }
}
