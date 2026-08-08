import {describe, expect, it} from 'vitest'
import ReconnectingWebSocket from 'partysocket/ws'
import {disposeSocket} from '../src/browser-transport.js'

const NATIVE_CONNECTING = 0
const NATIVE_OPEN = 1
const NATIVE_CLOSING = 2
const NATIVE_CLOSED = 3

class FakeNativeSocket extends EventTarget {
  static instances: FakeNativeSocket[] = []
  readonly CONNECTING = NATIVE_CONNECTING
  readonly OPEN = NATIVE_OPEN
  readonly CLOSING = NATIVE_CLOSING
  readonly CLOSED = NATIVE_CLOSED
  readyState = NATIVE_CONNECTING
  binaryType = 'blob'
  bufferedAmount = 0

  constructor() {
    super()
    FakeNativeSocket.instances.push(this)
  }

  send(): void {}

  close(): void {
    this.readyState = NATIVE_CLOSING
  }
}

async function waitForFakeInstance(): Promise<FakeNativeSocket> {
  while (FakeNativeSocket.instances.length === 0) await new Promise((resolve) => setTimeout(resolve, 0))
  const instance = FakeNativeSocket.instances[FakeNativeSocket.instances.length - 1]
  if (!instance) throw new Error('expected a fake socket instance to have been created')
  return instance
}

function openedSocket(): Promise<{socket: ReconnectingWebSocket; native: FakeNativeSocket}> {
  FakeNativeSocket.instances = []
  const socket = new ReconnectingWebSocket(() => 'ws://transport.test', [], {
    WebSocket: FakeNativeSocket,
    connectionTimeout: 200,
    minUptime: 10_000,
  })
  return waitForFakeInstance().then((native) => {
    native.readyState = NATIVE_OPEN
    native.dispatchEvent(new Event('open'))
    return {socket, native}
  })
}

describe('disposeSocket', () => {
  it('emits exactly one close event when the socket is open at dispose time', async () => {
    const {socket, native} = await openedSocket()
    let closeCount = 0
    socket.addEventListener('close', () => {
      closeCount += 1
    })

    disposeSocket(socket)

    expect(closeCount).toBe(1)
    expect(native.readyState).toBe(NATIVE_CLOSING)
  })

  it('does not synthesize a close event when the underlying socket is already closing, so the peer never sees two terminal events', async () => {
    const {socket, native} = await openedSocket()
    native.readyState = NATIVE_CLOSING
    let closeCount = 0
    socket.addEventListener('close', () => {
      closeCount += 1
    })

    disposeSocket(socket)
    expect(closeCount).toBe(0)

    native.readyState = NATIVE_CLOSED
    native.dispatchEvent(new Event('close'))

    expect(closeCount).toBe(1)
  })
})
