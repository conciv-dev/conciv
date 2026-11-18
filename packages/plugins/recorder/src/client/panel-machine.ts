export type PanelState =
  | {readonly status: 'idle'; readonly attempt: number}
  | {readonly status: 'exporting'; readonly attempt: number}
  | {readonly status: 'resetting'; readonly attempt: number}
  | {readonly status: 'disposed'; readonly attempt: number}

export type PanelEvent =
  | {readonly type: 'export.requested'}
  | {readonly type: 'reset.requested'}
  | {readonly type: 'settled'; readonly attempt: number}
  | {readonly type: 'failed'; readonly attempt: number}
  | {readonly type: 'disposed'}

export type PanelEffect =
  | {readonly type: 'export'; readonly attempt: number}
  | {readonly type: 'reset'; readonly attempt: number}
  | {readonly type: 'report-export-failed'}
  | {readonly type: 'report-reset-failed'}

export type PanelTransition = {readonly state: PanelState; readonly effects: readonly PanelEffect[]}

export const initialPanel: PanelState = {status: 'idle', attempt: 0}

export function transitionPanel(state: PanelState, event: PanelEvent): PanelTransition {
  if (state.status === 'disposed') return {state, effects: []}
  if (event.type === 'disposed') return {state: {status: 'disposed', attempt: state.attempt}, effects: []}
  if (event.type === 'export.requested' || event.type === 'reset.requested') {
    if (state.status !== 'idle') return {state, effects: []}
    const attempt = state.attempt + 1
    if (event.type === 'export.requested')
      return {state: {status: 'exporting', attempt}, effects: [{type: 'export', attempt}]}
    return {state: {status: 'resetting', attempt}, effects: [{type: 'reset', attempt}]}
  }
  if (event.attempt !== state.attempt || state.status === 'idle') return {state, effects: []}
  const idle: PanelState = {status: 'idle', attempt: state.attempt}
  if (event.type === 'settled') return {state: idle, effects: []}
  return {
    state: idle,
    effects: [{type: state.status === 'exporting' ? 'report-export-failed' : 'report-reset-failed'}],
  }
}
