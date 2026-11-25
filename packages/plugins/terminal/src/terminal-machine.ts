import type {MountedSession} from '@conciv/frontend-plugin-api'

export type LiveTerminal = {
  readonly key: string
  readonly ptyId: string
  readonly model: string | undefined
  readonly busy: () => boolean
}

export type TerminalRun = {
  readonly generation: number
  readonly restarting: boolean
  readonly live: LiveTerminal | null
  readonly failure: {readonly key: string; readonly message: string} | null
}

export type TerminalEvent =
  | {readonly type: 'opened'; readonly live: LiveTerminal}
  | {readonly type: 'closed'; readonly key: string}
  | {readonly type: 'failed'; readonly key: string; readonly message: string}
  | {readonly type: 'retried'}
  | {readonly type: 'restart.requested'; readonly session: MountedSession; readonly key: string}
  | {readonly type: 'restart.done'}
  | {readonly type: 'restart.failed'; readonly message: string}
  | {
      readonly type: 'model.picked'
      readonly session: MountedSession
      readonly key: string
      readonly model: string
      readonly shown: string | undefined
      readonly busy: boolean
    }

export type TerminalEffect =
  | {readonly type: 'remove-pty'; readonly session: MountedSession; readonly live: LiveTerminal | null}
  | {readonly type: 'toast'; readonly message: string}
  | {readonly type: 'save-prefs'; readonly sessionId: string; readonly model: string}

export type TerminalTransition = {readonly state: TerminalRun; readonly effects: readonly TerminalEffect[]}

export const initialTerminalRun: TerminalRun = {generation: 0, restarting: false, live: null, failure: null}

function stay(state: TerminalRun): TerminalTransition {
  return {state, effects: []}
}

function nextGeneration(state: TerminalRun): TerminalRun {
  return {...state, generation: state.generation + 1, failure: null}
}

function requestRestart(state: TerminalRun, session: MountedSession, key: string): TerminalTransition {
  if (state.restarting) return stay(state)
  const live = state.live?.key === key ? state.live : null
  return {state: {...state, restarting: true}, effects: [{type: 'remove-pty', session, live}]}
}

function pickModel(state: TerminalRun, event: Extract<TerminalEvent, {type: 'model.picked'}>): TerminalTransition {
  if (state.restarting || event.busy || event.model === event.shown) return stay(state)
  const restarted = requestRestart(state, event.session, event.key)
  return {
    state: restarted.state,
    effects: [{type: 'save-prefs', sessionId: event.session.id, model: event.model}, ...restarted.effects],
  }
}

export function transitionTerminal(state: TerminalRun, event: TerminalEvent): TerminalTransition {
  switch (event.type) {
    case 'opened':
      return stay({...state, live: event.live})
    case 'closed':
      return stay(state.live?.key === event.key ? {...state, live: null} : state)
    case 'failed':
      return stay({...state, failure: {key: event.key, message: event.message}})
    case 'retried':
      return stay(nextGeneration(state))
    case 'restart.requested':
      return requestRestart(state, event.session, event.key)
    case 'restart.done':
      return stay({...nextGeneration(state), restarting: false})
    case 'restart.failed':
      return {state: {...state, restarting: false}, effects: [{type: 'toast', message: event.message}]}
    case 'model.picked':
      return pickModel(state, event)
  }
}
