import type {Page, WebSocketRoute} from 'playwright'
import type {NavigationEntry} from '@conciv/protocol/chat-types'
import {observeRpc, type RpcObserver} from '@conciv/extension-testkit/rpc-observer'
import {decodeRpcFrame} from '@conciv/extension-testkit/rpc-frames'
import type {EmbedKit} from './boot.js'

const NAVIGATION_SET = ['navigation', 'set']

let lastStamp = 0

export function navigationStamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  return lastStamp
}

export async function setNavigation(kit: EmbedKit, entries: NavigationEntry[], index = 0): Promise<boolean> {
  const stored = await kit.rpc.navigation.get()
  lastStamp = Math.max(lastStamp, stored?.updatedAt ?? 0)
  const result = await kit.rpc.navigation.set({entries, index, updatedAt: navigationStamp()})
  return result.applied
}

export async function currentHref(kit: EmbedKit): Promise<string> {
  const persisted = await kit.rpc.navigation.get()
  return persisted?.entries[persisted.index]?.href ?? ''
}

function isNavigationWriteUrl(url: URL): boolean {
  return url.pathname.endsWith('/rpc/navigation/set')
}

export type HeldNavigationWrite = {arrived: Promise<void>; release: () => Promise<void>}

type Hold = {
  arrived: Promise<void>
  markArrived: () => void
  landed: Promise<void>
  markLanded: () => void
  seen: number
}

function makeHold(): Hold {
  const hold: Hold = {
    arrived: Promise.resolve(),
    markArrived: () => {},
    landed: Promise.resolve(),
    markLanded: () => {},
    seen: 0,
  }
  hold.arrived = new Promise<void>((resolve) => {
    hold.markArrived = resolve
  })
  hold.landed = new Promise<void>((resolve) => {
    hold.markLanded = resolve
  })
  return hold
}

function holdSocketNavigation(socket: WebSocketRoute, hold: Hold, gate: Promise<void>): void {
  const server = socket.connectToServer()
  const retained: {requestId: string | null} = {requestId: null}
  const outbound = {tail: Promise.resolve()}
  const inbound = {tail: Promise.resolve()}
  socket.onMessage((message) => {
    outbound.tail = outbound.tail.then(async () => {
      const frame = await decodeRpcFrame(message, 'outbound')
      if (frame.phase !== 'request' || !frame.path.endsWith('/navigation/set')) {
        server.send(message)
        return
      }
      hold.seen += 1
      if (hold.seen > 1) return
      retained.requestId = frame.requestId
      hold.markArrived()
      void gate.then(() => server.send(message))
    })
  })
  server.onMessage((message) => {
    socket.send(message)
    inbound.tail = inbound.tail.then(async () => {
      if (retained.requestId === null) return
      const frame = await decodeRpcFrame(message, 'inbound')
      if (frame.phase === 'response' && frame.requestId === retained.requestId) hold.markLanded()
    })
  })
}

export async function holdFirstNavigationWrite(page: Page): Promise<HeldNavigationWrite> {
  const hold = makeHold()
  let open = (): void => {}
  const gate = new Promise<void>((resolve) => {
    open = resolve
  })
  const observer = observeRpc(page)
  await page.route(
    (url) => isNavigationWriteUrl(url),
    async (route) => {
      hold.seen += 1
      if (hold.seen > 1) return route.abort()
      hold.markArrived()
      await gate
      await route.continue()
      await observer.completed({path: NAVIGATION_SET, timeout: 30_000})
      hold.markLanded()
    },
  )
  await page.routeWebSocket(
    (url) => url.pathname.endsWith('/rpc-ws'),
    (socket) => holdSocketNavigation(socket, hold, gate),
  )
  return {
    arrived: hold.arrived,
    release: async () => {
      open()
      await hold.landed
      observer.dispose()
    },
  }
}

export function waitForNavigationWrite(page: Page, observer?: RpcObserver): Promise<unknown> {
  const tap = observer ?? observeRpc(page)
  return tap.completed({path: NAVIGATION_SET, since: tap.mark(), timeout: 30_000}).finally(() => {
    if (!observer) tap.dispose()
  })
}

export function waitForNavigationWriteCarrying(page: Page, hrefFragment: string): Promise<unknown> {
  const tap = observeRpc(page)
  return tap
    .completed({path: NAVIGATION_SET, input: new RegExp(hrefFragment), timeout: 30_000})
    .finally(() => tap.dispose())
}

export async function freezeClock(page: Page, now: number): Promise<void> {
  await page.addInitScript((frozen: number) => {
    Date.now = () => frozen
  }, now)
}
