import {createEffect, createSignal, type Accessor} from 'solid-js'
import {makeTimer} from '@solid-primitives/timer'

export const SETTLE_DELAY_MS = 1000

export function createSettled(
  streaming: Accessor<boolean>,
  delayMs: Accessor<number | undefined> = () => undefined,
): Accessor<boolean> {
  const [settled, setSettled] = createSignal(!streaming())
  createEffect(() => {
    if (streaming()) {
      setSettled(false)
      return
    }
    makeTimer(() => setSettled(true), delayMs() ?? SETTLE_DELAY_MS, setTimeout)
  })
  return settled
}
