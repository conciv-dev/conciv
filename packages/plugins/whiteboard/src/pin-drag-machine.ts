import type {PinPatch} from './comment-writes.js'

export * as WhiteboardPinDragMachine from './pin-drag-machine.js'

const DRAG_THRESHOLD = 4

type Point = {readonly x: number; readonly y: number}

export type Drag = {
  readonly pointerId: number
  readonly cid: string
  readonly grabX: number
  readonly grabY: number
  readonly originX: number
  readonly originY: number
  readonly x: number
  readonly y: number
}

export type Prompt = {
  readonly cid: string
  readonly x: number
  readonly y: number
  readonly originX: number
  readonly originY: number
}

export type PinDragState = {readonly drag: Drag | null; readonly prompt: Prompt | null}

type PinDragEvent =
  | {
      readonly type: 'grab'
      readonly pointerId: number
      readonly cid: string
      readonly pin: Point
      readonly down: Point
      readonly held: boolean
    }
  | {readonly type: 'move'; readonly pointerId: number; readonly cid: string; readonly scene: Point}
  | {readonly type: 'drop'; readonly pointerId: number; readonly cid: string; readonly sourceLinked: boolean}
  | {readonly type: 'abandon'; readonly pointerId: number; readonly cid: string}
  | {readonly type: 'disconnect'}
  | {readonly type: 'keep'}
  | {readonly type: 'cancel'}

export type PinDragEffect =
  | {readonly type: 'capture'; readonly pointerId: number}
  | {readonly type: 'close-thread'}
  | {readonly type: 'toggle-thread'; readonly cid: string}
  | {readonly type: 'detach-anchor'; readonly cid: string}
  | {readonly type: 'move-pin'; readonly cid: string; readonly patch: PinPatch}

type PinDragTransition = {readonly state: PinDragState; readonly effects: readonly PinDragEffect[]}

export const initialPinDrag: PinDragState = {drag: null, prompt: null}

export function movedPastThreshold(drag: Drag): boolean {
  return Math.abs(drag.x - drag.originX) > DRAG_THRESHOLD || Math.abs(drag.y - drag.originY) > DRAG_THRESHOLD
}

export function selectHeldBy(state: PinDragState, cid: string, pointerId: number): Drag | undefined {
  const drag = state.drag
  return drag?.cid === cid && drag.pointerId === pointerId ? drag : undefined
}

export function selectScenePosition(state: PinDragState, pin: {readonly cid: string} & Point): Point {
  const held = [state.drag, state.prompt].find((entry) => entry?.cid === pin.cid)
  return held ? {x: held.x, y: held.y} : {x: pin.x, y: pin.y}
}

function release(state: PinDragState, drag: Drag, sourceLinked: boolean): PinDragTransition {
  const released = {...state, drag: null}
  if (!movedPastThreshold(drag)) return {state: released, effects: [{type: 'toggle-thread', cid: drag.cid}]}
  if (!sourceLinked)
    return {state: released, effects: [{type: 'move-pin', cid: drag.cid, patch: {x: drag.x, y: drag.y}}]}
  const prompt: Prompt = {cid: drag.cid, x: drag.x, y: drag.y, originX: drag.originX, originY: drag.originY}
  return {state: {...released, prompt}, effects: []}
}

function settlePrompt(state: PinDragState, keep: boolean): PinDragTransition {
  const prompt = state.prompt
  if (!prompt) return {state, effects: []}
  const settled = {...state, prompt: null}
  if (keep) {
    const patch: PinPatch = {
      x: prompt.x,
      y: prompt.y,
      pinState: 'offset',
      anchorX: prompt.originX,
      anchorY: prompt.originY,
    }
    return {state: settled, effects: [{type: 'move-pin', cid: prompt.cid, patch}]}
  }
  return {
    state: settled,
    effects: [
      {type: 'detach-anchor', cid: prompt.cid},
      {type: 'move-pin', cid: prompt.cid, patch: {x: prompt.x, y: prompt.y, pinState: 'offset'}},
    ],
  }
}

export function transitionPinDrag(state: PinDragState, event: PinDragEvent): PinDragTransition {
  if (event.type === 'grab') {
    if (event.held || state.prompt) return {state, effects: []}
    const drag: Drag = {
      pointerId: event.pointerId,
      cid: event.cid,
      grabX: event.pin.x - event.down.x,
      grabY: event.pin.y - event.down.y,
      originX: event.pin.x,
      originY: event.pin.y,
      x: event.pin.x,
      y: event.pin.y,
    }
    return {state: {...state, drag}, effects: [{type: 'capture', pointerId: event.pointerId}]}
  }
  if (event.type === 'disconnect') return settlePrompt(state, false)
  if (event.type === 'keep') return settlePrompt(state, true)
  if (event.type === 'cancel') return {state: {...state, prompt: null}, effects: []}
  const drag = selectHeldBy(state, event.cid, event.pointerId)
  if (!drag) return {state, effects: []}
  if (event.type === 'abandon') return {state: {...state, drag: null}, effects: []}
  if (event.type === 'drop') return release(state, drag, event.sourceLinked)
  const moved: Drag = {...drag, x: event.scene.x + drag.grabX, y: event.scene.y + drag.grabY}
  return {state: {...state, drag: moved}, effects: movedPastThreshold(drag) ? [{type: 'close-thread'}] : []}
}
