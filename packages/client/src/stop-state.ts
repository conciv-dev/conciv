import {createPolled} from '@solid-primitives/timer'
import {createSignal, type Accessor} from 'solid-js'

export const STOP_TIMEOUT_MS = 10_000

const STOP_POLL_MS = 500

export function isStopping(requestedAt: number | null, busy: boolean, now: number): boolean {
  if (requestedAt === null) return false
  if (!busy) return false
  return now - requestedAt < STOP_TIMEOUT_MS
}

export type StopState = {stopping: Accessor<boolean>; requestStop: () => void}

export function createStopState(busy: Accessor<boolean>): StopState {
  const [requestedAt, setRequestedAt] = createSignal<number | null>(null)
  const pollWhilePending = (): number | false => (requestedAt() === null ? false : STOP_POLL_MS)
  const stopping = createPolled(() => isStopping(requestedAt(), busy(), Date.now()), pollWhilePending)
  return {stopping, requestStop: () => setRequestedAt(Date.now())}
}
