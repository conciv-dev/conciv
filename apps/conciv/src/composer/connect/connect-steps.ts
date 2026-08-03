import type {LiveSession} from '@conciv/contract'

export type Adopted = {
  concivSessionId: string
  harnessSessionId: string
  title: string
  reloadCommand: string
}

export type ConnectStep =
  | {kind: 'closed'}
  | {kind: 'connecting'}
  | {kind: 'picking'; error: string | null; retryId: string | null}
  | {kind: 'reload'; adopted: Adopted}
  | {kind: 'leaveConfirm'; adopted: Adopted}
  | {kind: 'snippet'; command: string; detail: string}

export function dialogIsOpen(step: ConnectStep): boolean {
  return step.kind !== 'closed' && step.kind !== 'connecting'
}

const DIAL_IN_BASE_MS = 1_500
const BACKOFF_CEILING = 2

export const GIVE_UP_AFTER_FAILURES = 3

export function dialInPollMs(failures: number): number {
  const steps = Math.min(Math.max(failures, 0), BACKOFF_CEILING)
  return DIAL_IN_BASE_MS * 2 ** steps
}

export function orderCandidates(candidates: LiveSession[]): LiveSession[] {
  return candidates.toSorted((left, right) => {
    const byActivity = right.lastActivityAt - left.lastActivityAt
    return byActivity === 0 ? left.sessionId.localeCompare(right.sessionId) : byActivity
  })
}

export function mergeFrozen(frozen: LiveSession[], live: LiveSession[]): LiveSession[] {
  const running = new Map(live.map((session) => [session.sessionId, session]))
  return frozen.map((row) => running.get(row.sessionId) ?? {...row, working: false})
}

export function arrivedCount(frozen: LiveSession[] | null, live: LiveSession[]): number {
  if (!frozen) return 0
  const known = new Set(frozen.map((row) => row.sessionId))
  return live.filter((session) => !known.has(session.sessionId)).length
}
