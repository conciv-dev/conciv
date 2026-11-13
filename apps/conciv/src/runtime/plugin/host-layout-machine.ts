export const MOBILE_VIEW_PENDING_TTL_MS = 5_000

export type MobileViewState =
  | {readonly status: 'conversation'; readonly attempt: number}
  | {readonly status: 'active'; readonly attempt: number; readonly session: string; readonly view: string}
  | {readonly status: 'pending'; readonly attempt: number; readonly session: string; readonly view: string}
  | {readonly status: 'disposed'}

export type MobileViewEvent =
  | {readonly type: 'select'; readonly session: string; readonly view: string; readonly routed: string | undefined}
  | {readonly type: 'route.changed'; readonly routed: string | undefined}
  | {readonly type: 'expire'; readonly attempt: number}
  | {readonly type: 'disposed'}

export type MobileViewEffect =
  | {readonly type: 'schedule.expire'; readonly attempt: number; readonly timeoutMs: number}
  | {readonly type: 'cancel.expire'}

export type MobileViewTransition = {readonly state: MobileViewState; readonly effects: readonly MobileViewEffect[]}

export function createMobileViewState(): MobileViewState {
  return {status: 'conversation', attempt: 0}
}

export function transitionMobileView(state: MobileViewState, event: MobileViewEvent): MobileViewTransition {
  if (state.status === 'disposed') return {state, effects: []}
  const cancel: MobileViewEffect[] = state.status === 'pending' ? [{type: 'cancel.expire'}] : []

  if (event.type === 'disposed') return {state: {status: 'disposed'}, effects: cancel}

  if (event.type === 'select') {
    if (event.view === 'session')
      return {
        state: state.status === 'conversation' ? state : {status: 'conversation', attempt: state.attempt},
        effects: cancel,
      }

    if (event.session === event.routed)
      return {
        state: {status: 'active', attempt: state.attempt, session: event.session, view: event.view},
        effects: cancel,
      }
    const attempt = state.attempt + 1

    return {
      state: {status: 'pending', attempt, session: event.session, view: event.view},
      effects: [...cancel, {type: 'schedule.expire', attempt, timeoutMs: MOBILE_VIEW_PENDING_TTL_MS}],
    }
  }

  if (event.type === 'expire') {
    if (state.status !== 'pending' || event.attempt !== state.attempt) return {state, effects: []}

    return {state: {status: 'conversation', attempt: state.attempt}, effects: []}
  }

  if (state.status === 'conversation') return {state, effects: []}

  if (state.status === 'active' && event.routed === state.session) return {state, effects: []}

  if (state.status === 'pending' && event.routed === state.session)
    return {
      state: {status: 'active', attempt: state.attempt, session: state.session, view: state.view},
      effects: cancel,
    }

  return {state: {status: 'conversation', attempt: state.attempt}, effects: cancel}
}

export function selectMobileView(state: MobileViewState, mounted: string | undefined) {
  return state.status === 'active' && state.session === mounted ? state.view : 'session'
}
