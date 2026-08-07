import {randomUUID} from 'node:crypto'
import type {RecorderControl} from '../shared/protocol.js'

type AppendSource = {
  onAppend(listener: () => void): () => void
  head(): number
}

const CAPTURE_TTL_MS = 10 * 60 * 1000
const CAPTURE_SWEEP_MS = 5_000
export const VIEWER_LEASE_MS = 20_000

export type CaptureControl = {
  subscribe(emit: (control: RecorderControl) => void): () => void
  emit(control: RecorderControl): number
  isLive(): boolean
  startCapture(): {captureId: string; startTs: number; appendCursor: number}
  stopCapture(captureId: string): {startTs: number; stopTs: number; appendCursor: number} | null
  renewViewer(viewerId: string): boolean
  dropViewer(viewerId: string): void
  awaitAppendAfter(appendCursor: number, timeoutMs: number): Promise<boolean>
  dispose(): void
}

export function createCaptureControl(ring: AppendSource, now: () => number = Date.now): CaptureControl {
  const listeners = new Set<(control: RecorderControl) => void>()
  const captures = new Map<string, {startTs: number; expiresAt: number}>()
  const viewers = new Map<string, number>()

  const emit = (control: RecorderControl): number => {
    const appendCursor = ring.head()
    for (const listener of listeners) listener(control)
    return appendCursor
  }

  const isLive = (): boolean => captures.size > 0 || viewers.size > 0

  const expireCaptures = (nowTs: number): boolean => {
    let removed = false
    for (const [captureId, capture] of captures) {
      if (capture.expiresAt > nowTs) continue
      captures.delete(captureId)
      removed = true
    }
    return removed
  }

  const expireViewers = (nowTs: number): boolean => {
    let removed = false
    for (const [viewerId, expiresAt] of viewers) {
      if (expiresAt > nowTs) continue
      viewers.delete(viewerId)
      removed = true
    }
    return removed
  }

  const sweep = (): void => {
    const nowTs = now()
    const expiredCaptures = expireCaptures(nowTs)
    const expiredViewers = expireViewers(nowTs)
    if ((expiredCaptures || expiredViewers) && !isLive()) emit({live: false})
  }

  const sweepTimer = setInterval(sweep, CAPTURE_SWEEP_MS)
  sweepTimer.unref?.()

  const awaitAppendAfter = (appendCursor: number, timeoutMs: number): Promise<boolean> => {
    if (ring.head() > appendCursor) return Promise.resolve(true)
    return new Promise((resolve) => {
      const finish = (appended: boolean): void => {
        off()
        clearTimeout(timer)
        resolve(appended)
      }
      const off = ring.onAppend(() => finish(true))
      const timer = setTimeout(() => finish(false), timeoutMs)
    })
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit,
    isLive,
    startCapture() {
      const captureId = randomUUID()
      const startTs = now()
      captures.set(captureId, {startTs, expiresAt: startTs + CAPTURE_TTL_MS})
      const appendCursor = emit({live: true, snapshot: true, flush: true})
      return {captureId, startTs, appendCursor}
    },
    stopCapture(captureId) {
      const capture = captures.get(captureId)
      if (capture === undefined) return null
      captures.delete(captureId)
      const appendCursor = emit({flush: true, live: isLive()})
      return {startTs: capture.startTs, stopTs: now(), appendCursor}
    },
    renewViewer(viewerId) {
      const known = viewers.has(viewerId)
      viewers.set(viewerId, now() + VIEWER_LEASE_MS)
      if (!known && viewers.size === 1 && captures.size === 0) emit({live: true})
      return !known
    },
    dropViewer(viewerId) {
      if (!viewers.delete(viewerId)) return
      if (!isLive()) emit({live: false})
    },
    awaitAppendAfter,
    dispose() {
      clearInterval(sweepTimer)
    },
  }
}
