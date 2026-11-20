export * as RecorderPanelMachine from './panel-machine.js'
export type PanelState =
  | {readonly status: 'idle'; readonly attempt: number}
  | {readonly status: 'exporting'; readonly attempt: number}
  | {readonly status: 'sending'; readonly attempt: number}
  | {readonly status: 'resetting'; readonly attempt: number}
  | {readonly status: 'disposed'; readonly attempt: number}

export type SaveFailure = 'empty' | 'too-large' | 'io-error'

type PanelEvent =
  | {readonly type: 'export.requested'}
  | {readonly type: 'send.requested'}
  | {readonly type: 'reset.requested'}
  | {readonly type: 'settled'; readonly attempt: number}
  | {readonly type: 'failed'; readonly attempt: number; readonly refused?: SaveFailure}
  | {readonly type: 'disposed'}

export type PanelEffect =
  | {readonly type: 'export'; readonly attempt: number}
  | {readonly type: 'send'; readonly attempt: number}
  | {readonly type: 'reset'; readonly attempt: number}
  | {readonly type: 'report-export-failed'}
  | {readonly type: 'report-send-failed'}
  | {readonly type: 'report-save-refused'; readonly reason: SaveFailure}
  | {readonly type: 'report-reset-failed'}

type PanelTransition = {readonly state: PanelState; readonly effects: readonly PanelEffect[]}

const FAILURE_REPORTS: {
  readonly exporting: 'report-export-failed'
  readonly sending: 'report-send-failed'
  readonly resetting: 'report-reset-failed'
} = {
  exporting: 'report-export-failed',
  sending: 'report-send-failed',
  resetting: 'report-reset-failed',
}

export const initialPanel: PanelState = {status: 'idle', attempt: 0}

export function transitionPanel(state: PanelState, event: PanelEvent): PanelTransition {
  if (state.status === 'disposed') return {state, effects: []}
  if (event.type === 'disposed') return {state: {status: 'disposed', attempt: state.attempt}, effects: []}
  if (event.type === 'export.requested' || event.type === 'send.requested' || event.type === 'reset.requested') {
    if (state.status !== 'idle') return {state, effects: []}
    const attempt = state.attempt + 1
    if (event.type === 'export.requested')
      return {state: {status: 'exporting', attempt}, effects: [{type: 'export', attempt}]}
    if (event.type === 'send.requested')
      return {state: {status: 'sending', attempt}, effects: [{type: 'send', attempt}]}
    return {state: {status: 'resetting', attempt}, effects: [{type: 'reset', attempt}]}
  }
  if (event.attempt !== state.attempt || state.status === 'idle') return {state, effects: []}
  const idle: PanelState = {status: 'idle', attempt: state.attempt}
  if (event.type === 'settled') return {state: idle, effects: []}
  if (event.refused) return {state: idle, effects: [{type: 'report-save-refused', reason: event.refused}]}
  return {state: idle, effects: [{type: FAILURE_REPORTS[state.status]}]}
}
