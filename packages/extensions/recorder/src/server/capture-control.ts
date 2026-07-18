import {randomUUID} from 'node:crypto'
import type {RecorderControl} from '../shared/protocol.js'

type AppendSource = {
  onAppend(listener: (lastTs: number) => void): () => void
  lastTs(): number
}

export type CaptureControl = {
  subscribe(emit: (control: RecorderControl) => void): () => void
  emit(control: RecorderControl): void
  startCapture(): {captureId: string; startTs: number}
  stopCapture(captureId: string): {startTs: number; stopTs: number} | null
  awaitCoverage(ts: number, timeoutMs: number): Promise<boolean>
  awaitNextAppend(timeoutMs: number): Promise<boolean>
}

export function createCaptureControl(ring: AppendSource, now: () => number = Date.now): CaptureControl {
  const listeners = new Set<(control: RecorderControl) => void>()
  const captures = new Map<string, number>()

  const emit = (control: RecorderControl): void => {
    for (const listener of listeners) listener(control)
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit,
    startCapture() {
      const captureId = randomUUID()
      const startTs = now()
      captures.set(captureId, startTs)
      emit({live: true})
      return {captureId, startTs}
    },
    stopCapture(captureId) {
      const startTs = captures.get(captureId)
      if (startTs === undefined) return null
      captures.delete(captureId)
      emit({flush: true, live: captures.size > 0})
      return {startTs, stopTs: now()}
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
  }
}
