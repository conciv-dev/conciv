import {randomUUID} from 'node:crypto'
import type {RecorderControl} from '../shared/protocol.js'

type AppendSource = {
  onAppend(listener: (lastTs: number) => void): () => void
  lastTs(): number
}

const CAPTURE_TTL_MS = 10 * 60 * 1000
const CAPTURE_SWEEP_MS = 30_000

export type CaptureControl = {
  subscribe(emit: (control: RecorderControl) => void): () => void
  emit(control: RecorderControl): void
  startCapture(): {captureId: string; startTs: number}
  stopCapture(captureId: string): {startTs: number; stopTs: number} | null
  releaseAllCaptures(): void
  awaitCoverage(ts: number, timeoutMs: number): Promise<boolean>
  awaitNextAppend(timeoutMs: number): Promise<boolean>
  dispose(): void
}

export function createCaptureControl(ring: AppendSource, now: () => number = Date.now): CaptureControl {
  const listeners = new Set<(control: RecorderControl) => void>()
  const captures = new Map<string, {startTs: number; expiresAt: number}>()

  const emit = (control: RecorderControl): void => {
    for (const listener of listeners) listener(control)
  }

  const sweep = (): void => {
    const nowTs = now()
    let expired = false
    for (const [captureId, capture] of captures) {
      if (capture.expiresAt > nowTs) continue
      captures.delete(captureId)
      expired = true
    }
    if (expired && captures.size === 0) emit({live: false})
  }

  const sweepTimer = setInterval(sweep, CAPTURE_SWEEP_MS)
  sweepTimer.unref?.()

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit,
    startCapture() {
      const captureId = randomUUID()
      const startTs = now()
      captures.set(captureId, {startTs, expiresAt: startTs + CAPTURE_TTL_MS})
      emit({live: true})
      return {captureId, startTs}
    },
    stopCapture(captureId) {
      const capture = captures.get(captureId)
      if (capture === undefined) return null
      captures.delete(captureId)
      emit({flush: true, live: captures.size > 0})
      return {startTs: capture.startTs, stopTs: now()}
    },
    releaseAllCaptures() {
      if (captures.size === 0) return
      captures.clear()
      emit({live: false})
    },
    awaitNextAppend(timeoutMs) {
      return new Promise((resolve) => {
        const finish = (appended: boolean): void => {
          off()
          clearTimeout(timer)
          resolve(appended)
        }
        const off = ring.onAppend(() => finish(true))
        const timer = setTimeout(() => finish(false), timeoutMs)
      })
    },
    awaitCoverage(ts, timeoutMs) {
      if (ring.lastTs() >= ts) return Promise.resolve(true)
      return new Promise((resolve) => {
        const finish = (covered: boolean): void => {
          off()
          clearTimeout(timer)
          resolve(covered)
        }
        const off = ring.onAppend((lastTs) => {
          if (lastTs >= ts) finish(true)
        })
        const timer = setTimeout(() => finish(false), timeoutMs)
      })
    },
    dispose() {
      clearInterval(sweepTimer)
    },
  }
}
