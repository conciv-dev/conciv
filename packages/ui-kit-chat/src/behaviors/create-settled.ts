import {createEffect, createSignal, onCleanup, type Accessor} from 'solid-js'

export const SETTLE_DELAY_MS = 1000

export function createSettled(streaming: Accessor<boolean>, delayMs: number = SETTLE_DELAY_MS): Accessor<boolean> {
  const [settled, setSettled] = createSignal(!streaming())
  createEffect(() => {
    if (streaming()) {
      setSettled(false)
      return
    }
    const timer = setTimeout(() => setSettled(true), delayMs)
    onCleanup(() => clearTimeout(timer))
  })
  return settled
}
