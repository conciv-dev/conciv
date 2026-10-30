import {z} from 'zod'
import type {HotUpdateWait} from '../shared/defs.js'

type HotEvent = 'vite:beforeUpdate' | 'vite:afterUpdate' | 'vite:error'

export type HotSurface = {on: (event: HotEvent, listener: (payload: unknown) => void) => void}

const ErrorPayloadSchema = z.object({err: z.object({message: z.string()})})

const SETTLED = 'settled'

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function settledOrTimeout(settled: EventTarget, timeoutMs: number): Promise<'settled' | 'timeout'> {
  return new Promise((resolve) => {
    const timeout = AbortSignal.timeout(timeoutMs)
    timeout.addEventListener('abort', () => resolve('timeout'), {once: true})
    settled.addEventListener(SETTLED, () => resolve('settled'), {once: true, signal: timeout})
  })
}

export function watchHotUpdates(hot: HotSurface | undefined): (timeoutMs: number) => Promise<HotUpdateWait> {
  if (hot === undefined) return async () => ({supported: false, applied: false, waitedMs: 0, error: null})
  const state: {pending: boolean; error: string | null} = {pending: false, error: null}
  const settled = new EventTarget()
  hot.on('vite:beforeUpdate', () => {
    state.pending = true
  })
  hot.on('vite:afterUpdate', () => {
    state.pending = false
    state.error = null
    settled.dispatchEvent(new Event(SETTLED))
  })
  hot.on('vite:error', (payload) => {
    const parsed = ErrorPayloadSchema.safeParse(payload)
    state.pending = false
    state.error = parsed.success ? parsed.data.err.message : 'the hot update failed'
    settled.dispatchEvent(new Event(SETTLED))
  })
  return async (timeoutMs) => {
    if (!state.pending) return {supported: true, applied: false, waitedMs: 0, error: state.error}
    const startedAt = performance.now()
    const outcome = await settledOrTimeout(settled, timeoutMs)
    if (outcome === 'timeout') {
      const waitedMs = Math.round(performance.now() - startedAt)
      return {supported: true, applied: false, waitedMs, error: `the hot update did not land within ${timeoutMs}ms`}
    }
    if (state.error === null) await nextFrame()
    const waitedMs = Math.round(performance.now() - startedAt)
    return {supported: true, applied: state.error === null, waitedMs, error: state.error}
  }
}
