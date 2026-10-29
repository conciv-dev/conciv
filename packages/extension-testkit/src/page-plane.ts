import pTimeout from 'p-timeout'
import type {Page, WebSocket as PageWebSocket} from 'playwright'
import {PUSH_WS_PATH, PushFrameSchema} from '@conciv/protocol/push-types'

const SUBSCRIBE_TIMEOUT_MS = 30_000

export type PagePlaneWatch = {
  subscribed: () => Promise<void>
  dispose: () => void
}

type ReadyGate = {
  ready: Promise<boolean>
  open: (result: Promise<boolean>) => void
}

const watches = new WeakMap<Page, PagePlaneWatch>()

function parsedJson(payload: string): unknown {
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

function isReadyFrame(payload: string): boolean {
  const frame = PushFrameSchema.safeParse(parsedJson(payload))
  return frame.success && frame.data.channel === 'ready'
}

function isPushSocket(socket: PageWebSocket): boolean {
  return socket.url().includes(PUSH_WS_PATH)
}

function readyOf(socket: PageWebSocket): Promise<boolean> {
  return socket
    .waitForEvent('framereceived', {
      timeout: SUBSCRIBE_TIMEOUT_MS,
      predicate: (event) => isReadyFrame(String(event.payload)),
    })
    .then(
      () => true,
      () => false,
    )
}

function readyGate(): ReadyGate {
  const held: {open: (result: Promise<boolean>) => void} = {open: () => {}}
  const opened = new Promise<Promise<boolean>>((resolve) => {
    held.open = resolve
  })
  return {ready: opened.then((result) => result), open: (result) => held.open(result)}
}

function watchPagePlane(page: Page): PagePlaneWatch {
  const held: {gate: ReadyGate} = {gate: readyGate()}
  const onSocket = (socket: PageWebSocket): void => {
    if (!isPushSocket(socket)) return
    held.gate.open(readyOf(socket))
    socket.on('close', () => {
      held.gate = readyGate()
    })
  }
  page.on('websocket', onSocket)
  return {
    subscribed: async () => {
      const ready = await pTimeout(held.gate.ready, {
        milliseconds: SUBSCRIBE_TIMEOUT_MS,
        message: `no page plane push socket opened on ${PUSH_WS_PATH}`,
      })
      if (!ready) throw new Error(`the page plane push socket on ${PUSH_WS_PATH} never sent its ready frame`)
    },
    dispose: () => page.off('websocket', onSocket),
  }
}

export function pagePlaneWatchFor(page: Page): PagePlaneWatch {
  const existing = watches.get(page)
  if (existing) return existing
  const created = watchPagePlane(page)
  watches.set(page, created)
  return created
}

export async function awaitPagePlaneSubscribed(page: Page, arrive: () => Promise<void>): Promise<void> {
  const subscribed = pagePlaneWatchFor(page).subscribed()
  await Promise.all([arrive(), subscribed])
}
