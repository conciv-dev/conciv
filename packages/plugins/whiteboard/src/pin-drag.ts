import {createStore, reconcile} from 'solid-js/store'
import {screenToScene, type Viewport} from './coords.js'
import type {CommentRow, PinRow} from './rows.js'
import type {PinPatch} from './comment-writes.js'
import {WhiteboardPinDragMachine} from './pin-drag-machine.js'

type PinDragModel = {
  detachAnchor: (cid: string) => void
  movePin: (cid: string, patch: PinPatch) => void
  pinButton: (cid: string) => HTMLButtonElement | undefined
  closeThread: () => void
  toggleThread: (cid: string) => void
}

type PinDragEvent = Parameters<typeof WhiteboardPinDragMachine.transitionPinDrag>[1]

export function createPinDrag(model: PinDragModel) {
  const [state, setState] = createStore<WhiteboardPinDragMachine.PinDragState>({
    ...WhiteboardPinDragMachine.initialPinDrag,
  })

  const perform = (effect: WhiteboardPinDragMachine.PinDragEffect, target: HTMLButtonElement | undefined): void => {
    if (effect.type === 'capture') target?.setPointerCapture(effect.pointerId)
    else if (effect.type === 'close-thread') model.closeThread()
    else if (effect.type === 'toggle-thread') model.toggleThread(effect.cid)
    else if (effect.type === 'detach-anchor') model.detachAnchor(effect.cid)
    else model.movePin(effect.cid, effect.patch)
  }

  const dispatch = (event: PinDragEvent, target?: HTMLButtonElement): void => {
    const next = WhiteboardPinDragMachine.transitionPinDrag(state, event)
    setState(reconcile(next.state))
    next.effects.forEach((effect) => perform(effect, target))
  }

  const held = (): boolean => {
    const drag = state.drag
    return drag !== null && model.pinButton(drag.cid)?.hasPointerCapture(drag.pointerId) === true
  }

  return {
    scenePosition: (pin: PinRow): {x: number; y: number} => WhiteboardPinDragMachine.selectScenePosition(state, pin),
    grab: (view: Viewport, pin: PinRow, event: PointerEvent & {currentTarget: HTMLButtonElement}): void =>
      dispatch(
        {
          type: 'grab',
          pointerId: event.pointerId,
          cid: pin.cid,
          pin: {x: pin.x, y: pin.y},
          down: screenToScene(view, event.clientX, event.clientY),
          held: held(),
        },
        event.currentTarget,
      ),
    follow: (view: Viewport, pin: PinRow, event: PointerEvent): void =>
      dispatch({
        type: 'move',
        pointerId: event.pointerId,
        cid: pin.cid,
        scene: screenToScene(view, event.clientX, event.clientY),
      }),
    drop: (pin: PinRow, comment: CommentRow | undefined, event: PointerEvent): void =>
      dispatch({
        type: 'drop',
        pointerId: event.pointerId,
        cid: pin.cid,
        sourceLinked: comment?.kind === 'source-linked',
      }),
    abandon: (pin: PinRow, event: PointerEvent): void =>
      dispatch({type: 'abandon', pointerId: event.pointerId, cid: pin.cid}),
    prompting: (): boolean => state.prompt !== null,
    promptCid: (): string | undefined => state.prompt?.cid,
    promptAnchor: (): HTMLButtonElement | undefined => (state.prompt ? model.pinButton(state.prompt.cid) : undefined),
    disconnect: (): void => dispatch({type: 'disconnect'}),
    keep: (): void => dispatch({type: 'keep'}),
    cancel: (): void => dispatch({type: 'cancel'}),
  }
}
