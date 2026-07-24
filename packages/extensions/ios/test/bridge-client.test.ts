import {describe, expect, it, vi} from 'vitest'
import {createBridgeClient, type BridgeScheduler, type BridgeTransport} from '../src/shared/bridge-client.js'
import type {PageToNativeMessage} from '../src/shared/bridge.js'

function makeTestScheduler() {
  let nextId = 1
  const intervals = new Map<number, () => void>()
  const timeouts = new Map<number, {fn: () => void; remaining: number}>()
  const scheduler: BridgeScheduler = {
    setInterval(fn) {
      const id = nextId++
      intervals.set(id, fn)
      return id
    },
    clearInterval(id) {
      intervals.delete(id)
    },
    setTimeout(fn, ms) {
      const id = nextId++
      timeouts.set(id, {fn, remaining: ms})
      return id
    },
    clearTimeout(id) {
      timeouts.delete(id)
    },
  }
  function fireIntervals(): void {
    for (const fn of Array.from(intervals.values())) fn()
  }
  function advance(ms: number): void {
    for (const [id, timer] of Array.from(timeouts.entries())) {
      timer.remaining -= ms
      if (timer.remaining > 0) continue
      timeouts.delete(id)
      timer.fn()
    }
  }
  return {scheduler, fireIntervals, advance}
}

function makeTestTransport() {
  const posted: PageToNativeMessage[] = []
  let handler: ((raw: unknown) => void) | null = null
  const transport: BridgeTransport = {
    postToNative(message) {
      posted.push(message)
    },
    onNativeCall(next) {
      handler = next
    },
  }
  function emit(raw: unknown): void {
    handler?.(raw)
  }
  return {transport, posted, emit}
}

const API_BASE = 'http://127.0.0.1:5311'

function setup(overrides: Partial<Parameters<typeof createBridgeClient>[0]> = {}) {
  const sched = makeTestScheduler()
  const wire = makeTestTransport()
  const client = createBridgeClient({
    transport: wire.transport,
    scheduler: sched.scheduler,
    clientId: 'client-1',
    boundApiBase: API_BASE,
    readyIntervalMs: 300,
    pickTimeoutMs: 1000,
    ...overrides,
  })
  const countOf = (type: string) => wire.posted.filter((message) => message.type === type).length
  return {sched, wire, client, countOf}
}

describe('bridge client readiness', () => {
  it('re-posts bridge.ready until the first native call is acked', () => {
    const {sched, wire, client, countOf} = setup()
    client.start()
    expect(countOf('bridge.ready')).toBe(1)
    sched.fireIntervals()
    sched.fireIntervals()
    expect(countOf('bridge.ready')).toBe(3)
    wire.emit({v: 1, seq: 1, type: 'grabCapability', grabbable: true})
    const readyAfterAck = countOf('bridge.ready')
    sched.fireIntervals()
    sched.fireIntervals()
    expect(countOf('bridge.ready')).toBe(readyAfterAck)
  })

  it('acks every native call with its seq', () => {
    const {wire, client} = setup()
    client.start()
    wire.emit({v: 1, seq: 3, type: 'open'})
    wire.emit({v: 1, seq: 4, type: 'close'})
    const acks = wire.posted.filter((message) => message.type === 'bridge.ack')
    expect(acks).toEqual([
      {v: 1, type: 'bridge.ack', seq: 3},
      {v: 1, type: 'bridge.ack', seq: 4},
    ])
  })

  it('re-sends handshake.hello on ready ticks until a handshake arrives', () => {
    const onRebind = vi.fn()
    const {sched, wire, client, countOf} = setup({onRebind})
    client.start()
    expect(countOf('handshake.hello')).toBe(1)
    sched.fireIntervals()
    expect(countOf('handshake.hello')).toBe(2)
    wire.emit({v: 1, seq: 1, type: 'handshake', apiBase: API_BASE, token: null})
    const helloAfterHandshake = countOf('handshake.hello')
    sched.fireIntervals()
    sched.fireIntervals()
    expect(countOf('handshake.hello')).toBe(helloAfterHandshake)
    expect(onRebind).not.toHaveBeenCalled()
  })

  it('calls onRebind when the handshake base differs from the bound base', () => {
    const onRebind = vi.fn()
    const {wire, client} = setup({onRebind})
    client.start()
    wire.emit({v: 1, seq: 1, type: 'handshake', apiBase: 'http://127.0.0.1:9999', token: null})
    expect(onRebind).toHaveBeenCalledWith('http://127.0.0.1:9999')
  })

  it('surfaces bridge.incompatible via the callback', () => {
    const onIncompatible = vi.fn()
    const {wire, client} = setup({onIncompatible})
    client.start()
    wire.emit({v: 1, seq: 1, type: 'bridge.incompatible', nativeMinV: 2, nativeMaxV: 3})
    expect(onIncompatible).toHaveBeenCalledWith({nativeMinV: 2, nativeMaxV: 3})
  })

  it('treats open and close as set-state callbacks', () => {
    const ensureOpen = vi.fn()
    const ensureClose = vi.fn()
    const {wire, client} = setup({ensureOpen, ensureClose})
    client.start()
    wire.emit({v: 1, seq: 1, type: 'open'})
    wire.emit({v: 1, seq: 2, type: 'open'})
    wire.emit({v: 1, seq: 3, type: 'close'})
    expect(ensureOpen).toHaveBeenCalledTimes(2)
    expect(ensureClose).toHaveBeenCalledTimes(1)
  })
})

describe('bridge client grab pick engine', () => {
  const imageGrab = {
    text: 'Payroll Deposit',
    preview: {kind: 'image', dataUrl: 'data:image/jpeg;base64,AA==', width: 10, height: 10},
    rect: {x: 1, y: 2, width: 3, height: 4},
    source: {componentName: 'Cell', filePath: '', lineNumber: null},
  }

  function pickRequestId(posted: PageToNativeMessage[], index: number): string {
    const picks = posted.filter((message) => message.type === 'grab.pick')
    const message = picks[index]
    if (message === undefined || message.type !== 'grab.pick') throw new Error('no pick at index')
    return message.requestId
  }

  it('resolves the prior pick with null when a new pick supersedes it', async () => {
    const {wire, client} = setup()
    client.start()
    const first = client.pick('activate')
    const second = client.pick('comment')
    await expect(first).resolves.toBeNull()
    const secondId = pickRequestId(wire.posted, 1)
    wire.emit({v: 1, seq: 1, type: 'grabResult', requestId: secondId, grab: imageGrab})
    await expect(second).resolves.toMatchObject({text: 'Payroll Deposit'})
  })

  it('drops a grabResult whose requestId does not match the pending pick', async () => {
    const {wire, client} = setup()
    client.start()
    const pending = client.pick('activate')
    wire.emit({v: 1, seq: 1, type: 'grabResult', requestId: 'stale-id', grab: imageGrab})
    const currentId = pickRequestId(wire.posted, 0)
    wire.emit({v: 1, seq: 2, type: 'grabResult', requestId: currentId, grab: null})
    await expect(pending).resolves.toBeNull()
  })

  it('folds a grab subtree into grab.text', async () => {
    const {wire, client} = setup()
    client.start()
    const pending = client.pick('activate')
    const currentId = pickRequestId(wire.posted, 0)
    const withSubtree = {
      ...imageGrab,
      subtree: {
        class: 'PaymentCardCell',
        a11yId: 'PaymentsScreen/payrollRow',
        text: 'Payroll Deposit',
        rect: {x: 16, y: 232, width: 361, height: 72},
        children: [],
      },
    }
    wire.emit({v: 1, seq: 1, type: 'grabResult', requestId: currentId, grab: withSubtree})
    const grab = await pending
    expect(grab?.text).toContain('[view]')
    expect(grab?.text).toContain('PaymentCardCell #PaymentsScreen/payrollRow')
  })

  it('resolves null and posts grab.cancel on pick timeout', async () => {
    const {sched, client, countOf} = setup()
    client.start()
    const pending = client.pick('activate')
    sched.advance(1000)
    await expect(pending).resolves.toBeNull()
    expect(countOf('grab.cancel')).toBe(1)
  })

  it('cancel is idempotent and posts a single grab.cancel', async () => {
    const {wire, client, countOf} = setup()
    client.start()
    const pending = client.pick('activate')
    const requestId = pickRequestId(wire.posted, 0)
    client.cancel(requestId)
    client.cancel(requestId)
    await expect(pending).resolves.toBeNull()
    expect(countOf('grab.cancel')).toBe(1)
  })

  it('grabCapability drives the grabbable accessor', () => {
    const {wire, client} = setup()
    client.start()
    expect(client.grabbable()).toBe(true)
    wire.emit({v: 1, seq: 1, type: 'grabCapability', grabbable: false})
    expect(client.grabbable()).toBe(false)
  })
})

describe('bridge client disposal', () => {
  it('resolves a pending pick with null on dispose', async () => {
    const {client} = setup()
    client.start()
    const pending = client.pick('activate')
    client.dispose()
    await expect(pending).resolves.toBeNull()
  })
})
