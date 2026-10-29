import type {Page, WebSocket as PageWebSocket} from 'playwright'
import {approvalIds} from '@conciv/harness-testkit'
import {PUSH_WS_PATH, PushFrameSchema} from '@conciv/protocol/push-types'

export type PushWireWatch = {
  opened: () => number
  liveSockets: () => number
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
  const sockets = {count: 0, closed: 0}
  const approvals: string[] = []
  const onSocket = (socket: PageWebSocket): void => {
    if (!socket.url().includes(PUSH_WS_PATH)) return
    sockets.count += 1
    socket.on('close', () => {
      sockets.closed += 1
    })
    socket.on('framereceived', (event) => {
      approvals.push(...approvalsIn(String(event.payload)))
    })
  }
  page.on('websocket', onSocket)
  return {
    opened: () => sockets.count,
    liveSockets: () => sockets.count - sockets.closed,
    approvalIdsPushed: () => approvals,
  }
}
