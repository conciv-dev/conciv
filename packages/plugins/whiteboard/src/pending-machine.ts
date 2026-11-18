export type PendingOutcome = 'drawn' | 'unclaimed' | 'unfinished'

export type PendingClaim =
  | {readonly status: 'gone'}
  | {readonly status: 'unclaimed'}
  | {readonly status: 'claimed'; readonly until: number}

export type PendingState =
  | {readonly status: 'waiting'; readonly attempt: number}
  | {readonly status: 'claimed'; readonly attempt: number; readonly leaseUntil: number}
  | {readonly status: 'done'; readonly outcome: PendingOutcome}
  | {readonly status: 'disposed'}

export type PendingEvent =
  | {readonly type: 'drained'}
  | {readonly type: 'waitExpired'; readonly attempt: number; readonly claim: PendingClaim; readonly now: number}
  | {readonly type: 'disposed'}

export type PendingEffect =
  | {readonly type: 'wait'; readonly attempt: number; readonly ms: number}
  | {readonly type: 'finish'; readonly outcome: PendingOutcome}

export type PendingTransition = {readonly state: PendingState; readonly effects: readonly PendingEffect[]}

export function startPending(deadlineMs: number): PendingTransition {
  return {state: {status: 'waiting', attempt: 0}, effects: [{type: 'wait', attempt: 0, ms: deadlineMs}]}
}

function finish(outcome: PendingOutcome): PendingTransition {
  return {state: {status: 'done', outcome}, effects: [{type: 'finish', outcome}]}
}

function expire(attempt: number, claim: PendingClaim, now: number): PendingTransition {
  if (claim.status === 'gone') return finish('drawn')
  if (claim.status === 'unclaimed') return finish('unclaimed')
  if (claim.until <= now) return finish('unfinished')
  const next = attempt + 1
  return {
    state: {status: 'claimed', attempt: next, leaseUntil: claim.until},
    effects: [{type: 'wait', attempt: next, ms: claim.until - now}],
  }
}

export function transitionPending(state: PendingState, event: PendingEvent): PendingTransition {
  const unchanged = {state, effects: []}
  if (state.status === 'done' || state.status === 'disposed') return unchanged
  if (event.type === 'disposed') return {state: {status: 'disposed'}, effects: []}
  if (event.type === 'drained') return finish('drawn')
  if (event.attempt !== state.attempt) return unchanged
  return expire(state.attempt, event.claim, event.now)
}
