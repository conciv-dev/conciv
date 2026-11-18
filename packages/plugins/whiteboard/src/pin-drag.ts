import {createStore} from 'solid-js/store'
import {screenToScene, type Viewport} from './coords.js'
import type {CommentRow, PinRow} from './rows.js'
import type {PinPatch} from './comment-writes.js'

const DRAG_THRESHOLD = 4

type Drag = {cid: string; grabX: number; grabY: number; originX: number; originY: number; x: number; y: number}
type Prompt = {cid: string; x: number; y: number; originX: number; originY: number}

const movedPastThreshold = (drag: Drag): boolean =>
  Math.abs(drag.x - drag.originX) > DRAG_THRESHOLD || Math.abs(drag.y - drag.originY) > DRAG_THRESHOLD

type PinDragModel = {
  detachAnchor: (cid: string) => void
  movePin: (cid: string, patch: PinPatch) => void
  pinButton: (cid: string) => HTMLButtonElement | undefined
  closeThread: () => void
  toggleThread: (cid: string) => void
}

export function createPinDrag(model: PinDragModel) {
  const [state, setState] = createStore<{drag: Drag | null; prompt: Prompt | null}>({drag: null, prompt: null})

  const scenePosition = (pin: PinRow): {x: number; y: number} => {
    const held = [state.drag, state.prompt].find((entry) => entry?.cid === pin.cid)
    return held ? {x: held.x, y: held.y} : {x: pin.x, y: pin.y}
  }

  const disconnect = (): void => {
    const entry = state.prompt
    if (!entry) return
    model.detachAnchor(entry.cid)
    model.movePin(entry.cid, {x: entry.x, y: entry.y, pinState: 'offset'})
    setState('prompt', null)
  }
  const keep = (): void => {
    const entry = state.prompt
    if (!entry) return
    model.movePin(entry.cid, {
      x: entry.x,
      y: entry.y,
      pinState: 'offset',
      anchorX: entry.originX,
      anchorY: entry.originY,
    })
    setState('prompt', null)
  }
  const promptAnchor = (): HTMLButtonElement | undefined =>
    state.prompt ? model.pinButton(state.prompt.cid) : undefined

  const grab = (view: Viewport, pin: PinRow, event: PointerEvent & {currentTarget: HTMLButtonElement}): void => {
    const down = screenToScene(view, event.clientX, event.clientY)
    setState('drag', {
      cid: pin.cid,
      grabX: pin.x - down.x,
      grabY: pin.y - down.y,
      originX: pin.x,
      originY: pin.y,
      x: pin.x,
      y: pin.y,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const follow = (view: Viewport, pin: PinRow, event: PointerEvent): void => {
    const drag = state.drag
    if (!drag || drag.cid !== pin.cid) return
    const scene = screenToScene(view, event.clientX, event.clientY)
    setState('drag', {x: scene.x + drag.grabX, y: scene.y + drag.grabY})
    if (movedPastThreshold(drag)) model.closeThread()
  }

  const release = (drag: Drag, comment: CommentRow | undefined): void => {
    if (!movedPastThreshold(drag)) return model.toggleThread(drag.cid)
    if (comment?.kind !== 'source-linked') return model.movePin(drag.cid, {x: drag.x, y: drag.y})
    setState('prompt', {cid: drag.cid, x: drag.x, y: drag.y, originX: drag.originX, originY: drag.originY})
  }
  const drop = (pin: PinRow, comment: CommentRow | undefined): void => {
    const drag = state.drag
    setState('drag', null)
    if (drag?.cid === pin.cid) release(drag, comment)
  }

  return {
    scenePosition,
    grab,
    follow,
    drop,
    abandon: (): void => void setState('drag', null),
    prompting: (): boolean => state.prompt !== null,
    promptCid: (): string | undefined => state.prompt?.cid,
    promptAnchor,
    disconnect,
    keep,
    cancel: (): void => void setState('prompt', null),
  }
}
