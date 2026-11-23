export * as WhiteboardCanvasMachine from './canvas-machine.js'

export type CanvasState = {readonly open: boolean; readonly engaged: boolean}

type CanvasEvent = {readonly type: 'toggled'; readonly surfaceFailed: boolean} | {readonly type: 'closed'}

export type CanvasEffect = {readonly type: 'reload-surface'}

type CanvasTransition = {readonly state: CanvasState; readonly effects: readonly CanvasEffect[]}

export const initialCanvas: CanvasState = {open: false, engaged: false}

export function transitionCanvas(state: CanvasState, event: CanvasEvent): CanvasTransition {
  if (event.type === 'closed') return {state: {...state, open: false}, effects: []}
  if (event.surfaceFailed) return {state: {...state, open: true}, effects: [{type: 'reload-surface'}]}
  return {state: {engaged: true, open: !state.open}, effects: []}
}
