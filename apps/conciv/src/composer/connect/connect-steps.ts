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
  | {kind: 'snippet'; command: string; detail: string}

export const CLOSED: ConnectStep = {kind: 'closed'}

export function dialogIsOpen(step: ConnectStep): boolean {
  return step.kind === 'picking' || step.kind === 'reload' || step.kind === 'snippet'
}

export function stepOnOpen(candidates: LiveSession[]): ConnectStep {
  if (candidates.length === 1) return {kind: 'connecting'}
  return {kind: 'picking', error: null, retryId: null}
}

export function stepOnAdopted(adopted: Adopted, ready: boolean): ConnectStep {
  return ready ? CLOSED : {kind: 'reload', adopted}
}

export function stepOnAdoptFailed(failure: {message: string; sessionId: string}, snippet: string | null): ConnectStep {
  if (snippet !== null) return {kind: 'snippet', command: snippet, detail: failure.message}
  return {kind: 'picking', error: failure.message, retryId: failure.sessionId}
}

export function stepOnBack(): ConnectStep {
  return {kind: 'picking', error: null, retryId: null}
}

export function orderCandidates(candidates: LiveSession[]): LiveSession[] {
  return candidates.toSorted((left, right) => {
    const byActivity = right.lastActivityAt - left.lastActivityAt
    return byActivity === 0 ? left.sessionId.localeCompare(right.sessionId) : byActivity
  })
}
