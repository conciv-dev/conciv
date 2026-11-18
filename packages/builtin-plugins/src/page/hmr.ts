import {Effect, Option} from 'effect'
import {z} from 'zod'
import type {Operation} from '@conciv/plugin-page/rpc'

type HotUpdateWait = z.output<Extract<Operation, {readonly name: 'hmr'}>['output']>

type HotEvent = 'vite:beforeUpdate' | 'vite:afterUpdate' | 'vite:error'

export type HotSurface = {on: (event: HotEvent, listener: (payload: unknown) => void) => void}

type Settled = {at: number; error: string | null}

const ErrorPayloadSchema = z.object({err: z.object({message: z.string()})})

const SETTLED = 'settled'

const RECENT_SETTLE_MS = 1000

const nextFrame: Effect.Effect<void> = Effect.callback((resume) => {
  const frame = requestAnimationFrame(() => resume(Effect.void))
  return Effect.sync(() => cancelAnimationFrame(frame))
})

function nextSettle(settled: EventTarget): Effect.Effect<void> {
  return Effect.callback((resume, signal) => {
    settled.addEventListener(SETTLED, () => resume(Effect.void), {once: true, signal})
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
  const wait = Effect.fnUntraced(function* (timeoutMs: number) {
    const startedAt = performance.now()
    const recent = state.last
    if (recent !== null && startedAt - recent.at <= RECENT_SETTLE_MS) return outcome(recent, 0)
    const landed = yield* nextSettle(settled).pipe(Effect.timeoutOption(timeoutMs))
    const last = state.last
    if (Option.isNone(landed) || last === null) {
      const waitedMs = Math.round(performance.now() - startedAt)
      return {supported: true, applied: false, waitedMs, error: `the hot update did not land within ${timeoutMs}ms`}
    }
    if (last.error === null) {
      yield* nextFrame.pipe(Effect.timeoutOption(Math.max(timeoutMs - (performance.now() - startedAt), 0)))
    }
    return outcome(last, Math.round(performance.now() - startedAt))
  })
  return (timeoutMs) => Effect.runPromise(wait(timeoutMs))
}
