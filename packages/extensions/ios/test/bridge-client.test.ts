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

  function activatePick() {
    const {wire, client} = setup()
    client.start()
    const pending = client.pick('activate')
    return {wire, pending, currentId: pickRequestId(wire.posted, 0)}
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
    wire.emit({v: 1, seq: 2, type: 'grabResult', requestId: currentId, grab: null, reason: 'cancelled'})
    await expect(pending).resolves.toBeNull()
  })

  it('resolves null for a grabResult carrying reason cancelled', async () => {
    const {wire, pending, currentId} = activatePick()
    wire.emit({v: 1, seq: 1, type: 'grabResult', requestId: currentId, grab: null, reason: 'cancelled'})
    await expect(pending).resolves.toBeNull()
  })

  it('rejects a grabResult with a null grab and no reason', async () => {
    const {wire, pending, currentId} = activatePick()
    wire.emit({v: 1, seq: 1, type: 'grabResult', requestId: currentId, grab: null})
    await expect(pending).rejects.toThrow()
  })

  it('rejects immediately when an unparseable grabResult targets the pending pick', async () => {
    const {wire, pending, currentId} = activatePick()
    wire.emit({type: 'grabResult', requestId: currentId, grab: {bogus: true}})
    await expect(pending).rejects.toThrow()
  })

  it('folds a grab subtree into grab.text', async () => {
    const {wire, pending, currentId} = activatePick()
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

  it('folds view rects as whole points, never raw layout floats', async () => {
    const {wire, pending, currentId} = activatePick()
    const withFloatRect = {
      ...imageGrab,
      subtree: {
        class: 'PaymentCardCell',
        a11yId: null,
        text: null,
        rect: {x: -16, y: 330.0000000000333, width: 421.6, height: 51.5},
        children: [],
      },
    }
    wire.emit({v: 1, seq: 1, type: 'grabResult', requestId: currentId, grab: withFloatRect})
    const grab = await pending
    expect(grab?.text).toContain('(-16,330 422x52)')
    expect(grab?.text).not.toContain('330.0000000000333')
  })

  it('resolves a pick from a swift-encoded grabResult that omits nil optional keys', async () => {
    const {wire, pending, currentId} = activatePick()
    wire.emit({
      v: 1,
      seq: 1,
      type: 'grabResult',
      requestId: currentId,
      grab: {
        text: 'Payroll Deposit',
        preview: {kind: 'image', dataUrl: 'data:image/jpeg;base64,AA==', width: 10, height: 10},
        source: {componentName: 'UILabel', filePath: ''},
        subtree: {class: 'UILabel', rect: {x: 0, y: 0, width: 10, height: 10}, children: []},
      },
    })
    const grab = await pending
    expect(grab).not.toBeNull()
    expect(grab?.rect).toBeNull()
    expect(grab?.source).toEqual({componentName: 'UILabel', filePath: '', lineNumber: null})
  })

  it('rejects and posts grab.cancel on pick timeout', async () => {
    const {sched, client, countOf} = setup()
    client.start()
    const pending = client.pick('activate')
    sched.advance(1000)
    await expect(pending).rejects.toThrow()
    expect(countOf('grab.cancel')).toBe(1)
  })

  it('defaults the pick timeout to 10 seconds', async () => {
    const {sched, client, countOf} = setup({pickTimeoutMs: undefined})
    client.start()
    const pending = client.pick('activate')
    sched.advance(9999)
    expect(countOf('grab.cancel')).toBe(0)
    sched.advance(1)
    expect(countOf('grab.cancel')).toBe(1)
    await expect(pending).rejects.toThrow()
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

  it('starts fail-closed and flips grabbable when the capability arrives', () => {
    const {wire, client} = setup()
    client.start()
    expect(client.grabbable()).toBe(false)
    wire.emit({v: 1, seq: 1, type: 'grabCapability', grabbable: true})
    expect(client.grabbable()).toBe(true)
  })

  it('fires onGrabbableChanged only when the capability flips', () => {
    const onGrabbableChanged = vi.fn()
    const {wire, client} = setup({onGrabbableChanged})
    client.start()
    wire.emit({v: 1, seq: 1, type: 'grabCapability', grabbable: false})
    expect(onGrabbableChanged).not.toHaveBeenCalled()
    wire.emit({v: 1, seq: 2, type: 'grabCapability', grabbable: true})
    expect(onGrabbableChanged).toHaveBeenCalledTimes(1)
    expect(onGrabbableChanged).toHaveBeenCalledWith(true)
    expect(client.grabbable()).toBe(true)
    wire.emit({v: 1, seq: 3, type: 'grabCapability', grabbable: true})
    expect(onGrabbableChanged).toHaveBeenCalledTimes(1)
  })
})

describe('bridge client version negotiation', () => {
  it('treats a handshake outside the supported range as incompatible and does not rebind', () => {
    const onIncompatible = vi.fn()
    const onRebind = vi.fn()
    const {wire, client} = setup({onIncompatible, onRebind})
    client.start()
    wire.emit({v: 2, seq: 1, type: 'handshake', apiBase: 'http://127.0.0.1:9999', token: null})
    expect(onIncompatible).toHaveBeenCalledWith({nativeMinV: 2, nativeMaxV: 2})
    expect(onRebind).not.toHaveBeenCalled()
  })

  it('adopts the negotiated version and stamps it on every subsequent message (yields 1 for current peers)', () => {
    const {wire, client} = setup()
    client.start()
    wire.emit({v: 1, seq: 1, type: 'handshake', apiBase: API_BASE, token: null})
    client.panelToggled(true, true, null)
    const toggle = wire.posted.find((message) => message.type === 'host.panelToggled')
    const ack = wire.posted.find((message) => message.type === 'bridge.ack')
    expect(toggle?.v).toBe(1)
    expect(ack?.v).toBe(1)
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
