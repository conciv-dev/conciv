import {createPolled} from '@solid-primitives/timer'
import type {Accessor} from 'solid-js'
import type {Turn} from './grouping.js'
import {turnRollup} from './turn-rollup.js'

export type TurnClockState = {elapsedMs: number | null; frozen: boolean}

export function foldTurnClock(
  turns: ReadonlyArray<Turn>,
  startedAt: Map<string, number>,
  frozenElapsed: Map<string, number>,
  now: () => number,
): TurnClockState {
  const latest = turns.at(-1)
  if (!latest || latest.parts.length === 0) return {elapsedMs: null, frozen: false}
  const frozen = frozenElapsed.get(latest.key)
  if (frozen !== undefined) return {elapsedMs: frozen, frozen: true}
  const live = turnRollup(latest).live
  if (!startedAt.has(latest.key)) {
    if (!live) return {elapsedMs: null, frozen: false}
    startedAt.set(latest.key, now())
  }
  const begun = startedAt.get(latest.key)
  if (begun === undefined) return {elapsedMs: null, frozen: false}
  const elapsed = now() - begun
  if (!live) {
    frozenElapsed.set(latest.key, elapsed)
    return {elapsedMs: elapsed, frozen: true}
  }
  return {elapsedMs: elapsed, frozen: false}
}

export function createTurnClock(turnsAccessor: Accessor<ReadonlyArray<Turn>>): Accessor<TurnClockState> {
  const startedAt = new Map<string, number>()
  const frozenElapsed = new Map<string, number>()
  return createPolled(() => foldTurnClock(turnsAccessor(), startedAt, frozenElapsed, Date.now), 1000)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}
