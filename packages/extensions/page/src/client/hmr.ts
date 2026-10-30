import {z} from 'zod'
import type {HotUpdateWait} from '../shared/defs.js'

type HotEvent = 'vite:beforeUpdate' | 'vite:afterUpdate' | 'vite:error'

export type HotSurface = {on: (event: HotEvent, listener: (payload: unknown) => void) => void}

type Settled = {at: number; error: string | null}

const ErrorPayloadSchema = z.object({err: z.object({message: z.string()})})

const SETTLED = 'settled'

const RECENT_SETTLE_MS = 1000

function nextFrameWithin(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const deadline = AbortSignal.timeout(Math.max(timeoutMs, 0))
    const frame = requestAnimationFrame(() => resolve())
    deadline.addEventListener(
      'abort',
      () => {
        cancelAnimationFrame(frame)
        resolve()
      },
      {once: true},
    )
  })
}

function nextSettle(settled: EventTarget, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = AbortSignal.timeout(timeoutMs)
    timeout.addEventListener('abort', () => resolve(false), {once: true})
    settled.addEventListener(SETTLED, () => resolve(true), {once: true, signal: timeout})
  })
}

function outcome(last: Settled, waitedMs: number): HotUpdateWait {
  return {supported: true, applied: last.error === null, waitedMs, error: last.error}
}

export function watchHotUpdates(hot: HotSurface | undefined): (timeoutMs: number) => Promise<HotUpdateWait> {
  if (hot === undefined) return async () => ({supported: false, applied: false, waitedMs: 0, error: null})
  const state: {last: Settled | null} = {last: null}
  const settled = new EventTarget()
  const settle = (error: string | null): void => {
    state.last = {at: performance.now(), error}
    settled.dispatchEvent(new Event(SETTLED))
  }
  hot.on('vite:beforeUpdate', () => {
    state.last = null
  })
  hot.on('vite:afterUpdate', () => settle(null))
  hot.on('vite:error', (payload) => {
    const parsed = ErrorPayloadSchema.safeParse(payload)
    settle(parsed.success ? parsed.data.err.message : 'the hot update failed')
  })
  return async (timeoutMs) => {
    const startedAt = performance.now()
    const recent = state.last
    if (recent !== null && startedAt - recent.at <= RECENT_SETTLE_MS) return outcome(recent, 0)
    const landed = await nextSettle(settled, timeoutMs)
    const last = state.last
    if (!landed || last === null) {
      const waitedMs = Math.round(performance.now() - startedAt)
      return {supported: true, applied: false, waitedMs, error: `the hot update did not land within ${timeoutMs}ms`}
    }
    if (last.error === null) await nextFrameWithin(timeoutMs - (performance.now() - startedAt))
    return outcome(last, Math.round(performance.now() - startedAt))
  }
}
