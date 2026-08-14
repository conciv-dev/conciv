const NATIVE_CONNECTING = 0
const NATIVE_OPEN = 1
const NATIVE_CLOSING = 2
const NATIVE_CLOSED = 3

export class FakeNativeSocket extends EventTarget {
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
    queueMicrotask(() => {
      this.readyState = NATIVE_CLOSED
      this.dispatchEvent(new Event('close'))
    })
  }

  open(): void {
    this.readyState = NATIVE_OPEN
    this.dispatchEvent(new Event('open'))
  }

  fail(): void {
    this.readyState = NATIVE_CLOSED
    this.dispatchEvent(new Event('close'))
  }
}

export async function nextSocket(afterCount = 0): Promise<FakeNativeSocket> {
  while (FakeNativeSocket.instances.length <= afterCount) await new Promise((resolve) => setTimeout(resolve, 5))
  const instance = FakeNativeSocket.instances[FakeNativeSocket.instances.length - 1]
  if (!instance) throw new Error('expected a fake socket instance')
  return instance
}
