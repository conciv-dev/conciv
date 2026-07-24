import type {ElementRect, Grab} from '@conciv/grab'
import {
  BRIDGE_MAX_VERSION,
  BRIDGE_MIN_VERSION,
  type GrabMode,
  type NativeToPageMessage,
  NativeToPageSchema,
  type NeutralGrab,
  type PageToNativeMessage,
  type ViewNode,
} from './bridge.js'

export type BridgeTransport = {
  postToNative: (message: PageToNativeMessage) => void
  onNativeCall: (handler: (raw: unknown) => void) => void
}

export type BridgeScheduler = {
  setInterval: (fn: () => void, ms: number) => number
  clearInterval: (handle: number) => void
  setTimeout: (fn: () => void, ms: number) => number
  clearTimeout: (handle: number) => void
}

export type BridgeLogLevel = 'info' | 'warn' | 'error'

export type BridgeClientConfig = {
  transport: BridgeTransport
  scheduler: BridgeScheduler
  clientId: string
  boundApiBase: string
  readyIntervalMs?: number
  pickTimeoutMs?: number
  onRebind?: (apiBase: string) => void
  onIncompatible?: (info: {nativeMinV: number; nativeMaxV: number}) => void
  onHandshake?: (info: {v: number; apiBase: string; token: string | null}) => void
  ensureOpen?: () => void
  ensureClose?: () => void
  onLog?: (level: BridgeLogLevel, message: string) => void
}

export type BridgeClient = {
  start: () => void
  pick: (mode: GrabMode) => Promise<Grab | null>
  cancel: (requestId: string) => void
  cancelActive: () => void
  panelToggled: (open: boolean, connected: boolean, mascotRect: ElementRect | null) => void
  grabbable: () => boolean
  dispose: () => void
}

const DEFAULT_READY_INTERVAL_MS = 300
const DEFAULT_PICK_TIMEOUT_MS = 60_000
const SUBTREE_MAX_DEPTH = 3
const SUBTREE_MAX_NODES = 40

function formatViewNode(node: ViewNode, depth: number, budget: {remaining: number}, lines: string[]): void {
  if (depth > SUBTREE_MAX_DEPTH) return
  if (budget.remaining <= 0) return
  budget.remaining -= 1
  const indent = '  '.repeat(depth)
  const anchor = node.a11yId === null ? '' : ` #${node.a11yId}`
  const label = node.text === null ? '' : ` "${node.text}"`
  const rect = `(${node.rect.x},${node.rect.y} ${node.rect.width}x${node.rect.height})`
  lines.push(`${indent}${node.class}${anchor}${label} ${rect}`)
  for (const child of node.children) {
    formatViewNode(child, depth + 1, budget, lines)
  }
}

function foldSubtreeIntoText(text: string, subtree: ViewNode | undefined): string {
  if (subtree === undefined) return text
  const lines: string[] = []
  formatViewNode(subtree, 0, {remaining: SUBTREE_MAX_NODES}, lines)
  return `${text}\n\n[view]\n${lines.join('\n')}`
}

function neutralGrabToGrab(neutral: NeutralGrab): Grab {
  return {
    text: foldSubtreeIntoText(neutral.text, neutral.subtree),
    preview: neutral.preview,
    rect: neutral.rect,
    source: neutral.source,
  }
}

type PendingPick = {
  requestId: string
  resolve: (grab: Grab | null) => void
  timeout: number
}

export function createBridgeClient(config: BridgeClientConfig): BridgeClient {
  const readyIntervalMs = config.readyIntervalMs ?? DEFAULT_READY_INTERVAL_MS
  const pickTimeoutMs = config.pickTimeoutMs ?? DEFAULT_PICK_TIMEOUT_MS

  let started = false
  let disposed = false
  let firstCallAcked = false
  let handshakeDone = false
  let agreedVersion = BRIDGE_MAX_VERSION
  let boundApiBase = config.boundApiBase
  let readyTimer: number | null = null
  let requestCounter = 0
  let pending: PendingPick | null = null
  let grabbableState = true

  function log(level: BridgeLogLevel, message: string): void {
    config.onLog?.(level, message)
  }

  function post(message: PageToNativeMessage): void {
    config.transport.postToNative(message)
  }

  function postReady(): void {
    post({v: agreedVersion, type: 'bridge.ready'})
  }

  function postHello(): void {
    post({
      v: agreedVersion,
      type: 'handshake.hello',
      minV: BRIDGE_MIN_VERSION,
      maxV: BRIDGE_MAX_VERSION,
      clientId: config.clientId,
      bundleReady: true,
    })
  }

  function stopReadyLoopIfSettled(): void {
    if (readyTimer === null) return
    if (!firstCallAcked || !handshakeDone) return
    config.scheduler.clearInterval(readyTimer)
    readyTimer = null
  }

  function tick(): void {
    if (disposed) return
    if (!firstCallAcked) postReady()
    if (!handshakeDone) postHello()
    stopReadyLoopIfSettled()
  }

  function resolvePending(grab: Grab | null): void {
    if (pending === null) return
    config.scheduler.clearTimeout(pending.timeout)
    const resolve = pending.resolve
    pending = null
    resolve(grab)
  }

  function onPickTimeout(requestId: string): void {
    if (pending === null || pending.requestId !== requestId) return
    log('warn', `grab pick ${requestId} timed out`)
    post({v: agreedVersion, type: 'grab.cancel', requestId})
    resolvePending(null)
  }

  function handleHandshake(message: NativeToPageMessage & {type: 'handshake'}): void {
    handshakeDone = true
    agreedVersion = message.v
    config.onHandshake?.({v: message.v, apiBase: message.apiBase, token: message.token})
    if (message.apiBase !== boundApiBase) {
      boundApiBase = message.apiBase
      config.onRebind?.(message.apiBase)
    }
    stopReadyLoopIfSettled()
  }

  function handleGrabResult(message: NativeToPageMessage & {type: 'grabResult'}): void {
    if (pending === null || pending.requestId !== message.requestId) {
      log('warn', `dropping stale grabResult for ${message.requestId}`)
      return
    }
    resolvePending(message.grab === null ? null : neutralGrabToGrab(message.grab))
  }

  function dispatch(message: NativeToPageMessage): void {
    if (message.type === 'handshake') return handleHandshake(message)
    if (message.type === 'bridge.incompatible') {
      return config.onIncompatible?.({nativeMinV: message.nativeMinV, nativeMaxV: message.nativeMaxV})
    }
    if (message.type === 'open') return config.ensureOpen?.()
    if (message.type === 'close') return config.ensureClose?.()
    if (message.type === 'grabResult') return handleGrabResult(message)
    grabbableState = message.grabbable
  }

  function handleNativeCall(raw: unknown): void {
    if (disposed) return
    const parsed = NativeToPageSchema.safeParse(raw)
    if (!parsed.success) {
      log('warn', 'dropping unparseable native call')
      return
    }
    const message = parsed.data
    post({v: agreedVersion, type: 'bridge.ack', seq: message.seq})
    firstCallAcked = true
    stopReadyLoopIfSettled()
    dispatch(message)
  }

  function start(): void {
    if (started || disposed) return
    started = true
    config.transport.onNativeCall(handleNativeCall)
    tick()
    readyTimer = config.scheduler.setInterval(tick, readyIntervalMs)
  }

  function pick(mode: GrabMode): Promise<Grab | null> {
    resolvePending(null)
    requestCounter += 1
    const requestId = `${config.clientId}-pick-${requestCounter}`
    return new Promise((resolve) => {
      const timeout = config.scheduler.setTimeout(() => onPickTimeout(requestId), pickTimeoutMs)
      pending = {requestId, resolve, timeout}
      post({v: agreedVersion, type: 'grab.pick', requestId, mode})
    })
  }

  function cancel(requestId: string): void {
    if (pending === null || pending.requestId !== requestId) return
    post({v: agreedVersion, type: 'grab.cancel', requestId})
    resolvePending(null)
  }

  function cancelActive(): void {
    if (pending === null) return
    post({v: agreedVersion, type: 'grab.cancel', requestId: pending.requestId})
    resolvePending(null)
  }

  function panelToggled(open: boolean, connected: boolean, mascotRect: ElementRect | null): void {
    post(
      mascotRect === null
        ? {v: agreedVersion, type: 'host.panelToggled', open, connected}
        : {v: agreedVersion, type: 'host.panelToggled', open, connected, mascotRect},
    )
  }

  function grabbable(): boolean {
    return grabbableState
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    if (readyTimer !== null) {
      config.scheduler.clearInterval(readyTimer)
      readyTimer = null
    }
    resolvePending(null)
  }

  return {start, pick, cancel, cancelActive, panelToggled, grabbable, dispose}
}
