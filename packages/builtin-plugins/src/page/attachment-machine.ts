export type AttachmentOutcome =
  | 'born'
  | 'closed'
  | 'missing'
  | 'refused'
  | 'replaced'
  | 'transient'
  | 'unavailable'
  | 'unsupported'

export type AttachmentEnd = {readonly outcome: AttachmentOutcome; readonly attached: boolean}

export type AttachmentState = {
  readonly status: 'connecting' | 'backing-off' | 'waking' | 'stopped'
  readonly retries: number
}

export type AttachmentEvent =
  | {readonly type: 'ended'; readonly end: AttachmentEnd}
  | {readonly type: 'backed-off'}
  | {readonly type: 'woken'}

export type AttachmentEffect =
  | {readonly type: 'connect'}
  | {readonly type: 'wait-backoff'; readonly delayMillis: number}
  | {readonly type: 'wait-wake'}
  | {readonly type: 'notify'; readonly title: string; readonly outcome: AttachmentOutcome}
  | {readonly type: 'stop'}

export type AttachmentTransition = {readonly state: AttachmentState; readonly effects: readonly AttachmentEffect[]}

const BACKOFF_BASE_MILLIS = 1000

const BACKOFF_CAP_MILLIS = 30_000

const PAGE_TOOLS_OFF: Partial<Record<AttachmentOutcome, string>> = {
  refused: 'Page tools couldn’t attach to this session. Reload the page or start a new session.',
  unsupported: 'Page tools are off. Reload the page so it runs the same conciv version as the engine.',
}

export const startAttachment: AttachmentTransition = {
  state: {status: 'connecting', retries: 0},
  effects: [{type: 'connect'}],
}

export function settleAttachment(outcome: AttachmentOutcome, attached: boolean): AttachmentEnd {
  if (attached && (outcome === 'refused' || outcome === 'transient')) return {outcome: 'closed', attached}
  return {outcome, attached}
}

function backoffMillis(retries: number) {
  return Math.min(BACKOFF_BASE_MILLIS * 2 ** (retries - 1), BACKOFF_CAP_MILLIS)
}

function end(state: AttachmentState, {outcome, attached}: AttachmentEnd): AttachmentTransition {
  if (outcome === 'transient') {
    const retries = state.retries + 1
    return {
      state: {status: 'backing-off', retries},
      effects: [{type: 'wait-backoff', delayMillis: backoffMillis(retries)}],
    }
  }
  if (outcome === 'born') return startAttachment
  if (outcome === 'closed' && attached) return {state: {status: 'waking', retries: 0}, effects: [{type: 'wait-wake'}]}
  const title = PAGE_TOOLS_OFF[outcome]
  const notify: AttachmentEffect[] = title ? [{type: 'notify', title, outcome}] : []
  return {state: {...state, status: 'stopped'}, effects: [...notify, {type: 'stop'}]}
}

export function transitionAttachment(state: AttachmentState, event: AttachmentEvent): AttachmentTransition {
  if (event.type === 'ended' && state.status === 'connecting') return end(state, event.end)
  if (event.type === 'backed-off' && state.status === 'backing-off')
    return {state: {...state, status: 'connecting'}, effects: [{type: 'connect'}]}
  if (event.type === 'woken' && state.status === 'waking')
    return {state: {...state, status: 'connecting'}, effects: [{type: 'connect'}]}
  return {state, effects: []}
}
