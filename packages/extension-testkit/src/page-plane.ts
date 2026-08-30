import type {Page, WebSocket as PageWebSocket} from 'playwright'
import {PUSH_WS_PATH} from '@conciv/protocol/push-types'

const SUBSCRIBE_TIMEOUT_MS = 30_000

export async function awaitPagePlaneSubscribed(page: Page, arrive: () => Promise<void>): Promise<void> {
  const ready: {frame: Promise<unknown> | null} = {frame: null}
  const opened = page.waitForEvent('websocket', {
    timeout: SUBSCRIBE_TIMEOUT_MS,
    predicate: (socket: PageWebSocket) => {
      if (!socket.url().includes(PUSH_WS_PATH)) return false
      ready.frame = socket.waitForEvent('framereceived', {timeout: SUBSCRIBE_TIMEOUT_MS})
      return true
    },
  })
  await Promise.all([arrive(), opened])
  await ready.frame
}
