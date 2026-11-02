import {z} from 'zod'
import type {HotUpdateWait} from '../shared/defs.js'

type HotEvent = 'vite:beforeUpdate' | 'vite:afterUpdate' | 'vite:error'

export type HotSurface = {on: (event: HotEvent, listener: (payload: unknown) => void) => void}

type Settled = {at: number; error: string | null}

const ErrorPayloadSchema = z.object({err: z.object({message: z.string()})})

const UpdatePayloadSchema = z.object({updates: z.array(z.object({timestamp: z.number()}))})

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

async function reachedSince(input: {
  since: number
  timeoutMs: number
  settled: EventTarget
  applied: () => number
  startedAt: number
}): Promise<HotUpdateWait> {
  const {since, timeoutMs, settled, applied, startedAt} = input
  const waitedMs = (): number => Math.round(performance.now() - startedAt)
  if (applied() >= since) return {supported: true, applied: true, waitedMs: 0, error: null}
  const landed = await new Promise<boolean>((resolve) => {
    const timeout = AbortSignal.timeout(timeoutMs)
    timeout.addEventListener('abort', () => resolve(false), {once: true})
    settled.addEventListener(
      SETTLED,
      () => {
        if (applied() >= since) resolve(true)
      },
      {signal: timeout},
    )
  })
  if (!landed) {
    return {
      supported: true,
      applied: false,
      waitedMs: waitedMs(),
      error: `no hot update since ${since} landed within ${timeoutMs}ms`,
    }
  }
  await nextFrameWithin(timeoutMs - (performance.now() - startedAt))
  return {supported: true, applied: true, waitedMs: waitedMs(), error: null}
}

function outcome(last: Settled, waitedMs: number): HotUpdateWait {
  return {supported: true, applied: last.error === null, waitedMs, error: last.error}
}

export function watchHotUpdates(
  hot: HotSurface | undefined,
): (input: {timeout: number; since?: number}) => Promise<HotUpdateWait> {
  if (hot === undefined) return async () => ({supported: false, applied: false, waitedMs: 0, error: null})
  const state: {last: Settled | null; appliedAt: number} = {last: null, appliedAt: 0}
  const settled = new EventTarget()
  const settle = (error: string | null): void => {
    state.last = {at: performance.now(), error}
    settled.dispatchEvent(new Event(SETTLED))
  }
  hot.on('vite:beforeUpdate', () => {
    state.last = null
  })
  hot.on('vite:afterUpdate', (payload) => {
    const parsed = UpdatePayloadSchema.safeParse(payload)
    if (parsed.success)
      state.appliedAt = Math.max(state.appliedAt, ...parsed.data.updates.map((update) => update.timestamp))
    settle(null)
  })
  hot.on('vite:error', (payload) => {
    const parsed = ErrorPayloadSchema.safeParse(payload)
    settle(parsed.success ? parsed.data.err.message : 'the hot update failed')
  })
  return async ({timeout: timeoutMs, since}) => {
    const startedAt = performance.now()
    if (since !== undefined) return reachedSince({since, timeoutMs, settled, applied: () => state.appliedAt, startedAt})
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
