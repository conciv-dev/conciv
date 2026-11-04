import {createMemo, onCleanup, type JSX} from 'solid-js'
import {createStore, reconcile} from 'solid-js/store'
import {makeEventListener} from '@solid-primitives/event-listener'
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

function measure(): Measure {
  const rem = rootFontSizePx()
  const size = SIZE_REM * rem
  const pad = MARGIN_REM * rem
  const viewport = {width: viewportWidth(), height: viewportHeight()}
  return {
    size,
    viewport,
    bounds: {minX: pad, minY: pad, maxX: viewport.width - size - pad, maxY: viewport.height - size - pad},
    tabLength: TAB_LENGTH_REM * rem,
    tabPad: TAB_PAD_REM * rem,
  }
}

function square(m: Measure): {width: number; height: number} {
  return {width: m.size, height: m.size}
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

function pixelsOf(placement: Placement, m: Measure): TriggerCoords {
  if (placement.kind === 'corner') return cornerCoords(placement.corner, m.bounds)
  const percents = percentsOf(placement)
  return {
    x: toPixels(percents.x, m.bounds.minX, m.bounds.maxX),
    y: toPixels(percents.y, m.bounds.minY, m.bounds.maxY),
  }
}

function freeAt(at: TriggerCoords, m: Measure): Placement {
  return {
    kind: 'free',
    x: toPercent(at.x, m.bounds.minX, m.bounds.maxX),
    y: toPercent(at.y, m.bounds.minY, m.bounds.maxY),
  }
}

function tabSpan(edge: TriggerEdge, m: Measure): number {
  return (isSideEdge(edge) ? m.viewport.height : m.viewport.width) - m.tabLength - m.tabPad
}

function tabAlong(edge: TriggerEdge, at: TriggerCoords, m: Measure): number {
  return clamp(isSideEdge(edge) ? at.y : at.x, m.tabPad, Math.max(m.tabPad, tabSpan(edge, m)))
}

function edgeAt(edge: TriggerEdge, at: TriggerCoords, m: Measure): Placement {
  return {kind: 'edge', edge, along: toPercent(tabAlong(edge, at, m), m.tabPad, tabSpan(edge, m))}
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

export type LauncherSide = 'left' | 'right'

export type LauncherAnchor = {corner: TriggerCorner; side: LauncherSide; inline: string; top: string}

export type LauncherEdgeTab = {edge: TriggerEdge; along: string; preview: boolean}

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
  const m = press.measure
  const delta = {x: event.clientX - press.start.x, y: event.clientY - press.start.y}
  const at = {
    x: clamp(press.origin.x + delta.x, -m.size / 2, m.viewport.width - m.size / 2),
    y: clamp(press.origin.y + delta.y, -m.size / 2, m.viewport.height - m.size / 2),
  }
  const edge = offScreenEdge(at, square(m), m.viewport)
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

function anchorAt(at: TriggerCoords, m: Measure): LauncherAnchor {
  const corner = quadrantCorner(at, square(m), m.viewport)
  const side = corner.endsWith('left') ? 'left' : 'right'
  return {
    corner,
    side,
    inline: side === 'left' ? `${at.x}px` : `${m.viewport.width - at.x - m.size}px`,
    top: `${at.y}px`,
  }
}

function anchorOf(placement: Placement): LauncherAnchor {
  const percents = percentsOf(placement)
  const side = percents.x < 50 ? 'left' : 'right'
  return {
    corner: `${percents.y < 50 ? 'top' : 'bottom'}-${side}`,
    side,
    inline: spanCalc(side === 'left' ? percents.x : 100 - percents.x),
    top: spanCalc(percents.y),
  }
}

export function panelPlacement(anchor: LauncherAnchor): JSX.CSSProperties {
  const above = anchor.corner.startsWith('bottom')
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
    [anchor.side]: anchor.inline,
    'max-width': `calc(100% - ${anchor.inline} - ${MARGIN_REM}rem)`,
    'transform-origin': `${above ? 'bottom' : 'top'} ${anchor.side}`,
  }
}

export type DraggablePosition = {
  position: () => TriggerCorner
  anchor: () => LauncherAnchor
  dragging: () => boolean
  hotCorner: () => TriggerCorner | null
  previewing: () => boolean
  docked: () => boolean
  edgeTab: () => LauncherEdgeTab | null
  onPointerDown: (event: PointerEvent) => void
  onKeyDown: (event: KeyboardEvent) => void
  consumeClick: () => boolean
  restore: () => void
}

export function createDraggablePosition(opts: {initial: TriggerPosition; storageKey: string}): DraggablePosition {
  const [state, setState] = createStore<{placement: Placement; gesture: Gesture}>({
    placement: readStorage(opts.storageKey, parsePlacement, presetPlacement(opts.initial)),
    gesture: {phase: 'idle'},
  })
  const setGesture = (next: Gesture) => setState('gesture', reconcile(next))
  const commit = (placement: Placement) => {
    setState('placement', reconcile(placement))
    writeStorage(opts.storageKey, placement, JSON.stringify)
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
    const m = drag.measure
    const edge = offScreenEdge(drag.at, square(m), m.viewport)
    if (edge) {
      commit(edgeAt(edge, drag.at, m))
      setGesture({phase: 'released'})
      return
    }
    if (drag.hot) {
      settle(drag, [drag.at], {kind: 'corner', corner: drag.hot})
      return
    }
    const resting = clampToBounds(drag.at, m.bounds)
    const velocity = timeStamp - drag.last.t > STALE_RELEASE_MS ? {x: 0, y: 0} : drag.velocity
    const path = canThrow && !reduceMotion() ? throwPath(resting, velocity, m.bounds) : []
    const end = path.at(-1) ?? resting
    const corner = path.length === 0 ? null : thrownCorner(drag, velocity, end)
    settle(drag, [drag.at, ...path], corner ? {kind: 'corner', corner} : freeAt(end, m))
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
    const m = measure()
    setGesture({
      phase: 'pressing',
      element,
      pointerId: event.pointerId,
      start: {x: event.clientX, y: event.clientY},
      origin: pixelsOf(state.placement, m),
      measure: m,
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
    const dx = arrowStep(event.key, 'ArrowLeft', 'ArrowRight')
    const dy = arrowStep(event.key, 'ArrowUp', 'ArrowDown')
    if (dx === 0 && dy === 0) return
    event.preventDefault()
    const m = measure()
    const current = pixelsOf(state.placement, m)
    if (event.shiftKey) {
      const fallback =
        state.placement.kind === 'corner' ? state.placement.corner : quadrantCorner(current, square(m), m.viewport)
      const corner = directionCorner(dx * 100, dy * 100, fallback)
      if (corner) commit({kind: 'corner', corner})
      return
    }
    commit(freeAt(clampToBounds({x: current.x + dx * NUDGE, y: current.y + dy * NUDGE}, m.bounds), m))
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
    docked: () => state.placement.kind === 'edge',
    edgeTab,
    onPointerDown,
    onKeyDown,
    consumeClick,
    restore,
  }
}
