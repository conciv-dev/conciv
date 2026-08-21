import {createMemo, type Accessor} from 'solid-js'
import type {TurnRollup} from './turn-rollup.js'

export type SessionStatusKind = 'running' | 'waiting' | 'failed' | 'done'

export type SessionStatus = {kind: SessionStatusKind; label: string}

export type SessionStatusInput = {
  latestRollup: TurnRollup | undefined
  isStreaming: boolean
  queueLength: number
}

export function deriveSessionStatus(input: SessionStatusInput): SessionStatus {
  const {latestRollup, isStreaming, queueLength} = input
  if (latestRollup?.awaitingApproval) return {kind: 'waiting', label: 'WAITING'}
  const live = Boolean(latestRollup?.live) || isStreaming
  if (!live && (latestRollup?.failed ?? 0) > 0) return {kind: 'failed', label: 'FAILED'}
  if (live) {
    const label = queueLength > 0 ? `RUNNING 1/${queueLength + 1}` : 'RUNNING'
    return {kind: 'running', label}
  }
  return {kind: 'done', label: 'DONE'}
}

export function createSessionStatus(input: Accessor<SessionStatusInput>): Accessor<SessionStatus> {
  const status = createMemo(() => deriveSessionStatus(input()))
  return status
}
