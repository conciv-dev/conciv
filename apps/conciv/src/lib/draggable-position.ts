import {createMemo, onCleanup, type JSX} from 'solid-js'
import {createStore, reconcile} from 'solid-js/store'
import {makeEventListener} from '@solid-primitives/event-listener'
import {createElementSize, createWindowSize} from '@solid-primitives/resize-observer'
import {Debouncer} from '@tanstack/pacer'
import type {TriggerPosition} from '@conciv/protocol/config-types'
import {readStorage, writeStorage} from '@conciv/ui-kit-system'
import {
  DRAG_THRESHOLD,
  HOT_CORNER_HOLD_MS,
  clamp,
  cornerAt,
  cornerCoords,
  directionCorner,
  offScreenEdge,
  parsePlacement,
  presetPlacement,
  quadrantCorner,
  throwPath,
  toPercent,
  toPixels,
  viewportHeight,
  viewportWidth,
  type Bounds,
  type Placement,
  type TriggerCoords,
  type TriggerCorner,
  type TriggerEdge,
} from './draggable-physics.js'

const MARGIN_REM = 1.25
const SIZE_REM = 3.25
const TAB_LENGTH_REM = 2.75
const TAB_PAD_REM = 0.5
const PANEL_GAP_REM = 0.75
const NUDGE = 16
const STALE_RELEASE_MS = 50
const FRAME_MS = 1000 / 60
const SETTLE_MS = 280
const SETTLE_ID = 'conciv-fab-settle'
const FALLBACK_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const RESTING_EPSILON = 0.5
type Measure = {
  size: number
  viewport: {width: number; height: number}
  bounds: Bounds
  tabLength: number
  tabPad: number
}

function rootFontSizePx(): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function measure(available = {width: viewportWidth(), height: viewportHeight()}): Measure {
  const rem = rootFontSizePx()
  const size = SIZE_REM * rem
  const pad = MARGIN_REM * rem
  const viewport = {width: available.width, height: available.height}
  return {
    size,
    viewport,
    bounds: {minX: pad, minY: pad, maxX: viewport.width - size - pad, maxY: viewport.height - size - pad},
    tabLength: TAB_LENGTH_REM * rem,
    tabPad: TAB_PAD_REM * rem,
  }
}

function square(measured: Measure): {width: number; height: number} {
  return {width: measured.size, height: measured.size}
}

function isSideEdge(edge: TriggerEdge): boolean {
  return edge === 'left' || edge === 'right'
}

function percentsOf(placement: Placement): TriggerCoords {
  if (placement.kind === 'free') return {x: placement.x, y: placement.y}
  if (placement.kind === 'corner')
    return {x: placement.corner.endsWith('left') ? 0 : 100, y: placement.corner.startsWith('top') ? 0 : 100}
  if (placement.edge === 'left') return {x: 0, y: placement.along}
  if (placement.edge === 'right') return {x: 100, y: placement.along}
  if (placement.edge === 'top') return {x: placement.along, y: 0}
  return {x: placement.along, y: 100}
}

function pixelsOf(placement: Placement, measured: Measure): TriggerCoords {
  if (placement.kind === 'corner') return cornerCoords(placement.corner, measured.bounds)
  const percents = percentsOf(placement)
  return {
    x: toPixels(percents.x, measured.bounds.minX, measured.bounds.maxX),
    y: toPixels(percents.y, measured.bounds.minY, measured.bounds.maxY),
  }
}

function freeAt(at: TriggerCoords, measured: Measure): Placement {
  return {
    kind: 'free',
    x: toPercent(at.x, measured.bounds.minX, measured.bounds.maxX),
    y: toPercent(at.y, measured.bounds.minY, measured.bounds.maxY),
  }
}

function tabSpan(edge: TriggerEdge, measured: Measure): number {
  return (isSideEdge(edge) ? measured.viewport.height : measured.viewport.width) - measured.tabLength - measured.tabPad
}

function tabAlong(edge: TriggerEdge, at: TriggerCoords, measured: Measure): number {
  return clamp(isSideEdge(edge) ? at.y : at.x, measured.tabPad, Math.max(measured.tabPad, tabSpan(edge, measured)))
}

function edgeAt(edge: TriggerEdge, at: TriggerCoords, measured: Measure): Placement {
  return {kind: 'edge', edge, along: toPercent(tabAlong(edge, at, measured), measured.tabPad, tabSpan(edge, measured))}
}

function clampToBounds(at: TriggerCoords, bounds: Bounds): TriggerCoords {
  return {x: clamp(at.x, bounds.minX, bounds.maxX), y: clamp(at.y, bounds.minY, bounds.maxY)}
}

function spanCalc(percent: number): string {
  return `calc(${MARGIN_REM}rem + (100% - ${2 * MARGIN_REM + SIZE_REM}rem) * ${percent / 100})`
}

function tabCalc(percent: number): string {
  return `calc(${TAB_PAD_REM}rem + (100% - ${TAB_LENGTH_REM + 2 * TAB_PAD_REM}rem) * ${percent / 100})`
}

function reduceMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function settleEasing(element: HTMLElement): string {
  const token = getComputedStyle(element).getPropertyValue('--chat-ease-expo').trim()
  return token === '' ? FALLBACK_EASE : token
}

function arrowStep(key: string, back: string, forward: string): number {
  if (key === back) return -1
  if (key === forward) return 1
  return 0
}

export type LauncherAnchor = {corner: TriggerCorner; left: string; right: string; top: string}

export type LauncherEdgeTab = {edge: TriggerEdge; along: string; preview: boolean}

export type PanelFrame = {top: number; left: number; right: number; bottom: number}

type Press = {
  element: HTMLElement
  pointerId: number
  start: TriggerCoords
  origin: TriggerCoords
  measure: Measure
  from: Placement
  velocity: TriggerCoords
  last: {x: number; y: number; t: number}
}

type Drag = Press & {
  at: TriggerCoords
  edge: TriggerEdge | null
  hot: TriggerCorner | null
  snoozed: TriggerCorner | null
  magnetic: boolean
}

type Gesture =
  | {phase: 'idle'}
  | {phase: 'released'}
  | {phase: 'settling'}
  | ({phase: 'pressing'} & Press)
  | ({phase: 'dragging'} & Drag)

function fallbackCorner(press: Press): TriggerCorner {
  if (press.from.kind === 'corner') return press.from.corner
  return quadrantCorner(press.origin, square(press.measure), press.measure.viewport)
}

function hotCornerFor(press: Press, at: TriggerCoords, delta: TriggerCoords, magnetic: boolean): TriggerCorner | null {
  if (magnetic) return directionCorner(delta.x, delta.y, fallbackCorner(press))
  return cornerAt(at, press.measure.bounds)
}

function dragAt(press: Press, snoozed: TriggerCorner | null, event: PointerEvent): Drag {
  const measured = press.measure
  const delta = {x: event.clientX - press.start.x, y: event.clientY - press.start.y}
  const at = {
    x: clamp(press.origin.x + delta.x, -measured.size / 2, measured.viewport.width - measured.size / 2),
    y: clamp(press.origin.y + delta.y, -measured.size / 2, measured.viewport.height - measured.size / 2),
  }
  const edge = offScreenEdge(at, square(measured), measured.viewport)
  const corner = edge ? null : hotCornerFor(press, at, delta, event.shiftKey)
  const keptSnooze = corner === snoozed ? snoozed : null
  const elapsed = event.timeStamp - press.last.t
  const velocity =
    elapsed > 0
      ? {x: ((event.clientX - press.last.x) / elapsed) * 16, y: ((event.clientY - press.last.y) / elapsed) * 16}
      : press.velocity
  return {
    ...press,
    at,
    edge,
    hot: keptSnooze ? null : corner,
    snoozed: keptSnooze,
    magnetic: event.shiftKey,
    velocity,
    last: {x: event.clientX, y: event.clientY, t: event.timeStamp},
  }
}

function thrownCorner(drag: Drag, velocity: TriggerCoords, end: TriggerCoords): TriggerCorner | null {
  if (drag.magnetic) return directionCorner(velocity.x, velocity.y, fallbackCorner(drag), 0)
  return cornerAt(end, drag.measure.bounds)
}

function anchorAt(at: TriggerCoords, measured: Measure): LauncherAnchor {
  return {
    corner: quadrantCorner(at, square(measured), measured.viewport),
    left: `${at.x}px`,
    right: `${measured.viewport.width - at.x - measured.size}px`,
    top: `${at.y}px`,
  }
}

function anchorOf(placement: Placement): LauncherAnchor {
  const percents = percentsOf(placement)
  return {
    corner: `${percents.y < 50 ? 'top' : 'bottom'}-${percents.x < 50 ? 'left' : 'right'}`,
    left: spanCalc(percents.x),
    right: spanCalc(100 - percents.x),
    top: spanCalc(percents.y),
  }
}

export function launcherPlacement(anchor: LauncherAnchor, growsTowardStart: boolean): JSX.CSSProperties {
  if (growsTowardStart) return {right: anchor.right, top: anchor.top}
  return {left: anchor.left, top: anchor.top}
}

export function panelPlacement(anchor: LauncherAnchor): JSX.CSSProperties {
  const above = anchor.corner.startsWith('bottom')
  const side = anchor.corner.endsWith('left') ? 'left' : 'right'
  const inline = side === 'left' ? anchor.left : anchor.right
  const vertical: JSX.CSSProperties = above
    ? {
        bottom: `calc(100% - ${anchor.top} + ${PANEL_GAP_REM}rem)`,
        'max-height': `calc(${anchor.top} - ${PANEL_GAP_REM + MARGIN_REM}rem)`,
      }
    : {
        top: `calc(${anchor.top} + ${SIZE_REM + PANEL_GAP_REM}rem)`,
        'max-height': `calc(100% - ${anchor.top} - ${SIZE_REM + PANEL_GAP_REM + MARGIN_REM}rem)`,
      }
  return {
    ...vertical,
    [side]: inline,
    'max-width': `calc(100% - ${inline} - ${MARGIN_REM}rem)`,
    'transform-origin': `${above ? 'bottom' : 'top'} ${side}`,
  }
}

export type DraggablePosition = {
  position: () => TriggerCorner
  anchor: () => LauncherAnchor
  dragging: () => boolean
  hotCorner: () => TriggerCorner | null
  previewing: () => boolean
  growsTowardStart: (labelWidth: number) => boolean
  panelFrame: (size: {width: number; height: number}) => PanelFrame
  docked: () => boolean
  edgeTab: () => LauncherEdgeTab | null
  onPointerDown: (event: PointerEvent) => void
  onKeyDown: (event: KeyboardEvent) => void
  consumeClick: () => boolean
  restore: () => void
}

export function createDraggablePosition(options: {initial: TriggerPosition; storageKey: string}): DraggablePosition {
  const [state, setState] = createStore<{placement: Placement; gesture: Gesture}>({
    placement: readStorage(options.storageKey, parsePlacement, presetPlacement(options.initial)),
    gesture: {phase: 'idle'},
  })
  const setGesture = (next: Gesture) => setState('gesture', reconcile(next))
  const commit = (placement: Placement) => {
    setState('placement', reconcile(placement))
    writeStorage(options.storageKey, placement, JSON.stringify)
  }

  const onHeldStill = () => {
    const gesture = state.gesture
    if (gesture.phase !== 'dragging' || !gesture.hot) return
    setGesture({...gesture, snoozed: gesture.hot, hot: null})
  }
  const hold = new Debouncer(onHeldStill, {wait: HOT_CORNER_HOLD_MS})
  onCleanup(() => hold.cancel())

  const settle = (drag: Drag, frames: TriggerCoords[], placement: Placement) => {
    commit(placement)
    const final = pixelsOf(placement, drag.measure)
    const moved = frames.some((frame) => Math.hypot(frame.x - final.x, frame.y - final.y) >= RESTING_EPSILON)
    if (!moved || reduceMotion()) {
      setGesture({phase: 'released'})
      return
    }
    const element = drag.element
    const keyframes = [
      ...frames.map((frame) => ({transform: `translate(${frame.x - final.x}px, ${frame.y - final.y}px)`})),
      {transform: 'none'},
    ]
    const timing =
      frames.length > 2
        ? {duration: frames.length * FRAME_MS, easing: 'linear', id: SETTLE_ID}
        : {duration: SETTLE_MS, easing: settleEasing(element), id: SETTLE_ID}
    setGesture({phase: 'settling'})
    const done = () => {
      if (state.gesture.phase === 'settling') setGesture({phase: 'idle'})
    }
    element.animate(keyframes, timing).finished.then(done, done)
  }

  const release = (drag: Drag, timeStamp: number, canThrow: boolean) => {
    hold.cancel()
    const measured = drag.measure
    const edge = offScreenEdge(drag.at, square(measured), measured.viewport)
    if (edge) {
      commit(edgeAt(edge, drag.at, measured))
      setGesture({phase: 'released'})
      return
    }
    if (drag.hot) {
      settle(drag, [drag.at], {kind: 'corner', corner: drag.hot})
      return
    }
    const resting = clampToBounds(drag.at, measured.bounds)
    const velocity = timeStamp - drag.last.t > STALE_RELEASE_MS ? {x: 0, y: 0} : drag.velocity
    const path = canThrow && !reduceMotion() ? throwPath(resting, velocity, measured.bounds) : []
    const end = path.at(-1) ?? resting
    const corner = path.length === 0 ? null : thrownCorner(drag, velocity, end)
    settle(drag, [drag.at, ...path], corner ? {kind: 'corner', corner} : freeAt(end, measured))
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || state.placement.kind === 'edge') return
    if (!(event.currentTarget instanceof HTMLElement)) return
    const element = event.currentTarget
    element
      .getAnimations()
      .filter((animation) => animation.id === SETTLE_ID)
      .forEach((animation) => animation.cancel())
    element.setPointerCapture(event.pointerId)
    const measured = measure()
    setGesture({
      phase: 'pressing',
      element,
      pointerId: event.pointerId,
      start: {x: event.clientX, y: event.clientY},
      origin: pixelsOf(state.placement, measured),
      measure: measured,
      from: state.placement,
      velocity: {x: 0, y: 0},
      last: {x: event.clientX, y: event.clientY, t: event.timeStamp},
    })
  }

  makeEventListener(window, 'pointermove', (event: PointerEvent) => {
    const gesture = state.gesture
    if (gesture.phase !== 'pressing' && gesture.phase !== 'dragging') return
    if (event.pointerId !== gesture.pointerId) return
    const travelled = Math.hypot(event.clientX - gesture.start.x, event.clientY - gesture.start.y)
    if (gesture.phase === 'pressing' && travelled <= DRAG_THRESHOLD) return
    event.preventDefault()
    const next = dragAt(gesture, gesture.phase === 'dragging' ? gesture.snoozed : null, event)
    setGesture({...next, phase: 'dragging'})
    if (next.hot) {
      hold.maybeExecute()
      return
    }
    hold.cancel()
  })

  makeEventListener(window, 'pointerup', (event: PointerEvent) => {
    const gesture = state.gesture
    if (gesture.phase === 'pressing') setGesture({phase: 'idle'})
    if (gesture.phase === 'dragging') release(gesture, event.timeStamp, true)
  })

  makeEventListener(window, 'pointercancel', (event: PointerEvent) => {
    const gesture = state.gesture
    if (gesture.phase === 'pressing') setGesture({phase: 'idle'})
    if (gesture.phase === 'dragging') release(gesture, event.timeStamp, false)
  })

  makeEventListener(
    window,
    'keydown',
    (event: KeyboardEvent) => {
      const gesture = state.gesture
      if (event.key !== 'Escape' || (gesture.phase !== 'pressing' && gesture.phase !== 'dragging')) return
      event.preventDefault()
      event.stopPropagation()
      hold.cancel()
      if (gesture.element.hasPointerCapture(gesture.pointerId)) gesture.element.releasePointerCapture(gesture.pointerId)
      setGesture({phase: 'released'})
    },
    {capture: true},
  )

  const onKeyDown = (event: KeyboardEvent) => {
    const deltaX = arrowStep(event.key, 'ArrowLeft', 'ArrowRight')
    const deltaY = arrowStep(event.key, 'ArrowUp', 'ArrowDown')
    if (deltaX === 0 && deltaY === 0) return
    event.preventDefault()
    const measured = measure()
    const current = pixelsOf(state.placement, measured)
    if (event.shiftKey) {
      const fallback =
        state.placement.kind === 'corner'
          ? state.placement.corner
          : quadrantCorner(current, square(measured), measured.viewport)
      const corner = directionCorner(deltaX * 100, deltaY * 100, fallback)
      if (corner) commit({kind: 'corner', corner})
      return
    }
    commit(
      freeAt(clampToBounds({x: current.x + deltaX * NUDGE, y: current.y + deltaY * NUDGE}, measured.bounds), measured),
    )
  }

  const consumeClick = (): boolean => {
    if (state.gesture.phase === 'released') {
      setGesture({phase: 'idle'})
      return true
    }
    return state.gesture.phase === 'settling'
  }

  const restore = () => {
    if (state.placement.kind !== 'edge') return
    commit({kind: 'free', ...percentsOf(state.placement)})
    setGesture({phase: 'idle'})
  }

  const anchor = createMemo((): LauncherAnchor => {
    const gesture = state.gesture
    if (gesture.phase === 'dragging') return anchorAt(gesture.at, gesture.measure)
    return anchorOf(state.placement)
  })

  const rootSize = createElementSize(document.documentElement)
  const growsTowardStart = (labelWidth: number): boolean => {
    const measured = measure({width: rootSize.clientWidth ?? viewportWidth(), height: viewportHeight()})
    const gesture = state.gesture
    const left = gesture.phase === 'dragging' ? gesture.at.x : pixelsOf(state.placement, measured).x
    return left + measured.size + labelWidth > measured.viewport.width - measured.bounds.minX
  }

  const windowSize = createWindowSize()
  const launcherBox = createMemo((): {at: TriggerCoords; size: number} => {
    const gesture = state.gesture
    if (gesture.phase === 'dragging') return {at: gesture.at, size: gesture.measure.size}
    const measured = measure({width: rootSize.width ?? windowSize.width, height: windowSize.height})
    return {at: pixelsOf(state.placement, measured), size: measured.size}
  })
  const panelFrame = (size: {width: number; height: number}): PanelFrame => {
    const box = launcherBox()
    const corner = anchor().corner
    const gap = PANEL_GAP_REM * rootFontSizePx()
    const top = corner.startsWith('bottom') ? box.at.y - gap - size.height : box.at.y + box.size + gap
    const left = corner.endsWith('left') ? box.at.x : box.at.x + box.size - size.width
    return {top, left, right: left + size.width, bottom: top + size.height}
  }

  const edgeTab = (): LauncherEdgeTab | null => {
    const gesture = state.gesture
    if (gesture.phase === 'dragging' && gesture.edge)
      return {edge: gesture.edge, along: `${tabAlong(gesture.edge, gesture.at, gesture.measure)}px`, preview: true}
    const placement = state.placement
    if (placement.kind !== 'edge') return null
    return {edge: placement.edge, along: tabCalc(placement.along), preview: false}
  }

  return {
    position: () => anchor().corner,
    anchor,
    dragging: () => state.gesture.phase === 'dragging' || state.gesture.phase === 'settling',
    hotCorner: () => (state.gesture.phase === 'dragging' ? state.gesture.hot : null),
    previewing: () => state.gesture.phase === 'dragging' && state.gesture.edge !== null,
    growsTowardStart,
    panelFrame,
    docked: () => state.placement.kind === 'edge',
    edgeTab,
    onPointerDown,
    onKeyDown,
    consumeClick,
    restore,
  }
}
