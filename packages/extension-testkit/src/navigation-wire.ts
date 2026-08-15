import type {Page, Route, WebSocketRoute} from 'playwright'
import {z} from 'zod'
import {decodeRpcFrame} from './rpc-frames.js'
import {rpcObserverFor, type RpcObserver} from './rpc-observer.js'

const NAVIGATION_SET: readonly string[] = ['navigation', 'set']
const NAVIGATION_TIMEOUT_MS = 30_000

const NavigationWriteSchema = z.object({
  entries: z.array(z.object({href: z.string()})),
  index: z.number(),
})

export type HeldNavigationWrite = {arrived: Promise<void>; release: () => Promise<void>}

type HoldPhase = 'idle' | 'collecting' | 'released'

type Hold = {
  arrived: Promise<void>
  markArrived: () => void
  landed: Promise<void>
  markLanded: () => void
  phase: HoldPhase
  queue: (() => Promise<void>)[]
}

function isNavigationWriteUrl(url: URL): boolean {
  return url.pathname.endsWith('/rpc/navigation/set')
}

function hrefOf(input: unknown): string {
  const write = NavigationWriteSchema.parse(input)
  return write.entries[write.index]?.href ?? ''
}

function makeHold(): Hold {
  const hold: Hold = {
    arrived: Promise.resolve(),
    markArrived: () => {},
    landed: Promise.resolve(),
    markLanded: () => {},
    phase: 'idle',
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
      if (hold.phase === 'released') {
        server.send(message)
        return
      }
      const send = async (): Promise<void> => {
        server.send(message)
      }
      if (hold.phase === 'collecting') {
        hold.queue.push(send)
        return
      }
      hold.phase = 'collecting'
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
  const since = observer.mark()
  return new Promise<void>((resolve) => {
    const forward = async (): Promise<void> => {
      await route.continue()
      resolve()
    }
    if (hold.phase === 'released') {
      void forward()
      return
    }
    if (hold.phase === 'collecting') {
      hold.queue.push(forward)
      return
    }
    hold.phase = 'collecting'
    hold.markArrived()
    hold.queue.unshift(async () => {
      await forward()
      const landed = observer.completed({path: NAVIGATION_SET, since, timeout: NAVIGATION_TIMEOUT_MS})
      void landed.then(() => hold.markLanded())
    })
  })
}

export type NavigationWireWatch = {
  holdFirstWrite: () => Promise<HeldNavigationWrite>
  nextWrite: () => Promise<string>
  nextWriteCarrying: (hrefFragment: string) => Promise<string>
}

export function watchNavigationWire(page: Page): NavigationWireWatch {
  const observer = rpcObserverFor(page)

  return {
    holdFirstWrite: async () => {
      const hold = makeHold()
      const fetchHandler = (route: Route): Promise<void> => holdFetchNavigation(hold, route, observer)
      await page.route(isNavigationWriteUrl, fetchHandler)
      await page.routeWebSocket(
        (url) => url.pathname.endsWith('/rpc-ws'),
        (socket) => holdSocketNavigation(socket, hold),
      )
      return {
        arrived: hold.arrived,
        release: async () => {
          const pending = hold.queue.splice(0)
          hold.phase = 'released'
          for (const send of pending) await send()
          await hold.landed
          await page.unroute(isNavigationWriteUrl, fetchHandler)
        },
      }
    },
    nextWrite: () => {
      const since = observer.mark()
      return observer
        .completed({path: NAVIGATION_SET, since, timeout: NAVIGATION_TIMEOUT_MS})
        .then((call) => hrefOf(call.input))
    },
    nextWriteCarrying: (hrefFragment) => {
      const since = observer.mark()
      return observer
        .completed({
          path: NAVIGATION_SET,
          input: new RegExp(hrefFragment),
          since,
          timeout: NAVIGATION_TIMEOUT_MS,
        })
        .then((call) => hrefOf(call.input))
    },
  }
}
