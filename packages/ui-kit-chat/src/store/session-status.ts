import {createMemo, type Accessor} from 'solid-js'
import type {TurnRollup} from './turn-rollup.js'

export type SessionStatusKind = 'unstarted' | 'running' | 'stopping' | 'waiting' | 'failed' | 'stopped' | 'done'

export type SessionStatus = {kind: SessionStatusKind; label: string; reason?: string}

export type SessionStatusInput = {
  latestRollup: TurnRollup | undefined
  isStreaming: boolean
  queueLength: number
  stopping: boolean
  approvalPending: boolean
  runError: string | null
  stopped: boolean
  ran: boolean
}

function runningStatus(queueLength: number): SessionStatus {
  return {kind: 'running', label: queueLength > 0 ? `RUNNING 1/${queueLength + 1}` : 'RUNNING'}
}

export function deriveSessionStatus(input: SessionStatusInput): SessionStatus {
  const {latestRollup, isStreaming, queueLength, stopping, approvalPending, runError, stopped, ran} = input
  if (stopping) return {kind: 'stopping', label: 'STOPPING'}
  if (approvalPending || latestRollup?.awaitingApproval) return {kind: 'waiting', label: 'WAITING'}
  if (Boolean(latestRollup?.live) || isStreaming) return runningStatus(queueLength)
  if (runError !== null) return {kind: 'failed', label: 'FAILED', reason: runError}
  if (stopped) return {kind: 'stopped', label: 'STOPPED'}
  if (!ran) return {kind: 'unstarted', label: ''}
  return {kind: 'done', label: 'DONE'}
}

export function createSessionStatus(input: Accessor<SessionStatusInput>): Accessor<SessionStatus> {
  const status = createMemo(() => deriveSessionStatus(input()))
  return status
}
