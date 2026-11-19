export const HIDDEN_PAUSE_MS = 30_000

export type VisibilityPauseState =
  | {readonly status: 'visible'; readonly attempt: number}
  | {readonly status: 'hiding'; readonly attempt: number}
  | {readonly status: 'paused'; readonly attempt: number}
  | {readonly status: 'disposed'; readonly attempt: number}

type VisibilityPauseEvent =
  | {readonly type: 'hidden'}
  | {readonly type: 'shown'}
  | {readonly type: 'hide.elapsed'; readonly attempt: number}
  | {readonly type: 'disposed'}

export type VisibilityPauseEffect =
  | {readonly type: 'wait'; readonly attempt: number}
  | {readonly type: 'cancel-wait'}
  | {readonly type: 'pause'}
  | {readonly type: 'resume'}

type VisibilityPauseTransition = {
  readonly state: VisibilityPauseState
  readonly effects: readonly VisibilityPauseEffect[]
}

export const initialVisibilityPause: VisibilityPauseState = {status: 'visible', attempt: 0}

export function transitionVisibilityPause(
  state: VisibilityPauseState,
  event: VisibilityPauseEvent,
): VisibilityPauseTransition {
  if (state.status === 'disposed') return {state, effects: []}
  if (event.type === 'disposed')
    return {state: {status: 'disposed', attempt: state.attempt}, effects: [{type: 'cancel-wait'}]}
  if (event.type === 'hidden') {
    if (state.status === 'paused') return {state, effects: []}
    const attempt = state.attempt + 1
    return {state: {status: 'hiding', attempt}, effects: [{type: 'wait', attempt}]}
  }
  if (event.type === 'shown') {
    if (state.status === 'hiding')
      return {state: {status: 'visible', attempt: state.attempt}, effects: [{type: 'cancel-wait'}]}
    if (state.status === 'paused')
      return {state: {status: 'visible', attempt: state.attempt}, effects: [{type: 'resume'}]}
    return {state, effects: []}
  }
  if (state.status !== 'hiding' || event.attempt !== state.attempt) return {state, effects: []}
  return {state: {status: 'paused', attempt: state.attempt}, effects: [{type: 'pause'}]}
}
