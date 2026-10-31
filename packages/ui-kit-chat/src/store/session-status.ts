import {createMemo, type Accessor} from 'solid-js'
import type {TurnRollup} from './turn-rollup.js'

export type SessionStatusKind = 'running' | 'stopping' | 'waiting' | 'failed' | 'stopped' | 'done'

export type SessionStatus = {kind: SessionStatusKind; label: string; reason?: string}

export type SessionStatusInput = {
  latestRollup: TurnRollup | undefined
  isStreaming: boolean
  queueLength: number
  stopping: boolean
  runError: string | null
  stopped: boolean
}

function runningStatus(queueLength: number): SessionStatus {
  return {kind: 'running', label: queueLength > 0 ? `RUNNING 1/${queueLength + 1}` : 'RUNNING'}
}

export function deriveSessionStatus(input: SessionStatusInput): SessionStatus {
  const {latestRollup, isStreaming, queueLength, stopping, runError, stopped} = input
  if (stopping) return {kind: 'stopping', label: 'STOPPING'}
  if (latestRollup?.awaitingApproval) return {kind: 'waiting', label: 'WAITING'}
  if (Boolean(latestRollup?.live) || isStreaming) return runningStatus(queueLength)
  if (runError !== null) return {kind: 'failed', label: 'FAILED', reason: runError}
  if (stopped) return {kind: 'stopped', label: 'STOPPED'}
  return {kind: 'done', label: 'DONE'}
}

export function createSessionStatus(input: Accessor<SessionStatusInput>): Accessor<SessionStatus> {
  const status = createMemo(() => deriveSessionStatus(input()))
  return status
}
