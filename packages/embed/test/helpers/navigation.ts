import type {Page, Route, WebSocketRoute} from 'playwright'
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
  retained: boolean
  queue: (() => Promise<void>)[]
}

function makeHold(): Hold {
  const hold: Hold = {
    arrived: Promise.resolve(),
    markArrived: () => {},
    landed: Promise.resolve(),
    markLanded: () => {},
    retained: false,
    queue: [],
  }
  hold.arrived = new Promise<void>((resolve) => {
    hold.markArrived = resolve
  })
  hold.landed = new Promise<void>((resolve) => {
    hold.markLanded = resolve
  })
  return hold
}

function holdSocketNavigation(socket: WebSocketRoute, hold: Hold): void {
  const server = socket.connectToServer()
  const retained: {requestId: string | null} = {requestId: null}
  const outbound = {tail: Promise.resolve()}
  const inbound = {tail: Promise.resolve()}
  socket.onMessage((message) => {
    outbound.tail = outbound.tail.then(async () => {
      const frame = await decodeRpcFrame(message, 'outbound')
      if (frame.phase !== 'request' || frame.procedurePath.join('/') !== NAVIGATION_SET.join('/')) {
        server.send(message)
        return
      }
      const send = async (): Promise<void> => {
        server.send(message)
      }
      if (hold.retained) {
        hold.queue.push(send)
        return
      }
      hold.retained = true
      retained.requestId = frame.requestId
      hold.markArrived()
      hold.queue.unshift(send)
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

function holdFetchNavigation(hold: Hold, route: Route, observer: RpcObserver): Promise<void> {
  const mark = observer.mark()
  return new Promise<void>((resolve) => {
    const forward = async (): Promise<void> => {
      await route.continue()
      resolve()
    }
    if (hold.retained) {
      hold.queue.push(forward)
      return
    }
    hold.retained = true
    hold.markArrived()
    hold.queue.unshift(async () => {
      await forward()
      const landed = observer.completed({path: NAVIGATION_SET, since: mark, timeout: 30_000})
      void landed.then(() => hold.markLanded())
    })
  })
}

export async function holdFirstNavigationWrite(page: Page): Promise<HeldNavigationWrite> {
  const hold = makeHold()
  const observer = observeRpc(page)
  await page.route(
    (url) => isNavigationWriteUrl(url),
    (route) => holdFetchNavigation(hold, route, observer),
  )
  await page.routeWebSocket(
    (url) => url.pathname.endsWith('/rpc-ws'),
    (socket) => holdSocketNavigation(socket, hold),
  )
  return {
    arrived: hold.arrived,
    release: async () => {
      for (const send of hold.queue.splice(0)) await send()
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
