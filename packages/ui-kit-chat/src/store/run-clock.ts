import {createPolled} from '@solid-primitives/timer'
import type {Accessor} from 'solid-js'
import {isRunPhaseTerminal, type RunClockSource} from '@conciv/protocol/run-types'

export type {RunClockSource}

export type RunClockState = {elapsedMs: number | null; frozen: boolean}

const RUN_CLOCK_POLL_MS = 1000

export function runClock(source: RunClockSource | null, now: number): RunClockState {
  if (!source) return {elapsedMs: null, frozen: false}
  const {lifecycle} = source
  if (lifecycle.finishedAt !== null) {
    return {elapsedMs: Math.max(0, lifecycle.finishedAt - lifecycle.startedAt), frozen: true}
  }
  const onServer = lifecycle.serverNow - lifecycle.startedAt
  const sinceReceipt = now - source.receivedAt
  return {elapsedMs: Math.max(0, onServer + sinceReceipt), frozen: false}
}

export function createRunClock(source: Accessor<RunClockSource | null>): Accessor<RunClockState> {
  const tickWhileLive = (): number | false => {
    const current = source()
    return current && !isRunPhaseTerminal(current.lifecycle.phase) ? RUN_CLOCK_POLL_MS : false
  }
  return createPolled(() => runClock(source(), Date.now()), tickWhileLive)
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
