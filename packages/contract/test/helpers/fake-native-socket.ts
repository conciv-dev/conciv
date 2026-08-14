const NATIVE_CONNECTING = 0
const NATIVE_OPEN = 1
const NATIVE_CLOSING = 2
const NATIVE_CLOSED = 3

export type FakeNativeSocket = EventTarget & {
  readonly CONNECTING: number
  readonly OPEN: number
  readonly CLOSING: number
  readonly CLOSED: number
  readyState: number
  binaryType: string
  bufferedAmount: number
  send: () => void
  close: () => void
  open: () => void
  fail: () => void
}

type Waiter = {afterCount: number; resolve: (socket: FakeNativeSocket) => void}

let instances: FakeNativeSocket[] = []
let waiters: Waiter[] = []

function resolveReadyWaiters(): void {
  const instance = instances[instances.length - 1]
  if (!instance) return
  const ready = waiters.filter((waiter) => instances.length > waiter.afterCount)
  waiters = waiters.filter((waiter) => instances.length <= waiter.afterCount)
  for (const waiter of ready) waiter.resolve(instance)
}

export function resetFakeNativeSockets(): void {
  instances = []
  waiters = []
}

function createFakeNativeSocket(): FakeNativeSocket {
  const socket: FakeNativeSocket = Object.assign(new EventTarget(), {
    CONNECTING: NATIVE_CONNECTING,
    OPEN: NATIVE_OPEN,
    CLOSING: NATIVE_CLOSING,
    CLOSED: NATIVE_CLOSED,
    readyState: NATIVE_CONNECTING,
    binaryType: 'blob',
    bufferedAmount: 0,
    send: (): void => {},
    close: (): void => {},
    open: (): void => {},
    fail: (): void => {},
  })
  socket.close = (): void => {
    socket.readyState = NATIVE_CLOSING
    queueMicrotask(() => {
      socket.readyState = NATIVE_CLOSED
      socket.dispatchEvent(new Event('close'))
    })
  }
  socket.open = (): void => {
    socket.readyState = NATIVE_OPEN
    socket.dispatchEvent(new Event('open'))
  }
  socket.fail = (): void => {
    socket.readyState = NATIVE_CLOSED
    socket.dispatchEvent(new Event('close'))
  }
  return socket
}

export function fakeNativeSocketConstructor(): FakeNativeSocket {
  const socket = createFakeNativeSocket()
  instances.push(socket)
  resolveReadyWaiters()
  return socket
}

export function nextSocket(afterCount = 0): Promise<FakeNativeSocket> {
  const latest = instances[instances.length - 1]
  if (instances.length > afterCount && latest) return Promise.resolve(latest)
  return new Promise((resolve) => {
    waiters.push({afterCount, resolve})
  })
}
