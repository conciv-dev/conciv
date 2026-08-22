import {createSignal, type JSX} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
import type {TriggerPosition} from '@conciv/protocol/config-types'
import {readStorage, writeStorage} from '@conciv/ui-kit-system'

const MARGIN = 20
const SETTLE_MS = 280
const FALLBACK_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const DRAG_THRESHOLD = 6
const RESTING_EPSILON = 0.5
const ALL: TriggerPosition[] = ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right']

function anchorOf(position: TriggerPosition, vw: number, vh: number): {x: number; y: number} {
  const x = position.endsWith('left') ? MARGIN : vw - MARGIN
  const y = position.startsWith('top') ? MARGIN : position.startsWith('middle') ? vh / 2 : vh - MARGIN
  return {x, y}
}

function restingCenter(element: HTMLElement): {x: number; y: number; halfWidth: number; halfHeight: number} {
  const halfWidth = element.offsetWidth / 2
  const halfHeight = element.offsetHeight / 2
  return {x: element.offsetLeft + halfWidth, y: element.offsetTop + halfHeight, halfWidth, halfHeight}
}

function nearestPreset(x: number, y: number, vw: number, vh: number): TriggerPosition {
  let best: TriggerPosition = 'bottom-right'
  let bestDist = Infinity
  for (const preset of ALL) {
    const anchor = anchorOf(preset, vw, vh)
    const dist = (anchor.x - x) ** 2 + (anchor.y - y) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = preset
    }
  }
  return best
}

function clampToViewport(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  vw: number,
  vh: number,
): {x: number; y: number} {
  return {
    x: Math.min(Math.max(x, halfWidth), Math.max(halfWidth, vw - halfWidth)),
    y: Math.min(Math.max(y, halfHeight), Math.max(halfHeight, vh - halfHeight)),
  }
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

function parsePosition(raw: string): TriggerPosition | undefined {
  return ALL.find((preset) => preset === raw)
}

type Grip = {element: HTMLElement; halfWidth: number; halfHeight: number; restX: number; restY: number}

type DragMachine =
  | {phase: 'idle'}
  | {phase: 'pressing'; grip: Grip; startX: number; startY: number}
  | {phase: 'dragging'; grip: Grip; centerX: number; centerY: number; offsetX: number; offsetY: number}
  | {phase: 'settling'}

export type DraggablePosition = {
  position: () => TriggerPosition
  dragging: () => boolean
  dragStyle: () => JSX.CSSProperties
  onPointerDown: (event: PointerEvent) => void
  consumeClick: () => boolean
}

export function createDraggablePosition(opts: {initial: TriggerPosition; storageKey: string}): DraggablePosition {
  const [position, setPosition] = createSignal<TriggerPosition>(
    readStorage(opts.storageKey, parsePosition, opts.initial),
  )
  const [machine, setMachine] = createSignal<DragMachine>({phase: 'idle'})
  let suppressClick = false
  let inFlight: Animation | undefined

  const dragStateAt = (grip: Grip, clientX: number, clientY: number): DragMachine => {
    const center = clampToViewport(
      clientX,
      clientY,
      grip.halfWidth,
      grip.halfHeight,
      window.innerWidth,
      window.innerHeight,
    )
    return {
      phase: 'dragging',
      grip,
      centerX: center.x,
      centerY: center.y,
      offsetX: center.x - grip.restX,
      offsetY: center.y - grip.restY,
    }
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    if (!(event.currentTarget instanceof HTMLElement)) return
    inFlight?.cancel()
    inFlight = undefined
    setMachine({phase: 'idle'})
    const rest = restingCenter(event.currentTarget)
    setMachine({
      phase: 'pressing',
      grip: {
        element: event.currentTarget,
        halfWidth: rest.halfWidth,
        halfHeight: rest.halfHeight,
        restX: rest.x,
        restY: rest.y,
      },
      startX: event.clientX,
      startY: event.clientY,
    })
  }

  makeEventListener(window, 'pointermove', (event: PointerEvent) => {
    const current = machine()
    if (current.phase === 'idle' || current.phase === 'settling') return
    if (current.phase === 'dragging') {
      setMachine(dragStateAt(current.grip, event.clientX, event.clientY))
      return
    }
    const travelled = Math.abs(event.clientX - current.startX) + Math.abs(event.clientY - current.startY)
    if (travelled <= DRAG_THRESHOLD) return
    setMachine(dragStateAt(current.grip, event.clientX, event.clientY))
  })

  const releaseTo = (grip: Grip, centerX: number, centerY: number) => {
    const next = nearestPreset(centerX, centerY, window.innerWidth, window.innerHeight)
    setMachine({phase: 'settling'})
    setPosition(next)
    writeStorage(opts.storageKey, next)
    const rest = restingCenter(grip.element)
    const residualX = centerX - rest.x
    const residualY = centerY - rest.y
    if (Math.hypot(residualX, residualY) < RESTING_EPSILON || reduceMotion()) {
      setMachine({phase: 'idle'})
      return
    }
    const settle = grip.element.animate(
      [{transform: `translate(${residualX}px, ${residualY}px)`}, {transform: 'none'}],
      {duration: SETTLE_MS, easing: settleEasing(grip.element)},
    )
    inFlight = settle
    const returnToIdle = () => {
      if (inFlight !== settle) return
      inFlight = undefined
      setMachine({phase: 'idle'})
    }
    settle.finished.then(returnToIdle, returnToIdle)
  }

  makeEventListener(window, 'pointerup', () => {
    const current = machine()
    if (current.phase === 'idle' || current.phase === 'settling') return
    if (current.phase === 'pressing') {
      setMachine({phase: 'idle'})
      return
    }
    suppressClick = true
    releaseTo(current.grip, current.centerX, current.centerY)
  })

  makeEventListener(window, 'pointercancel', () => {
    const current = machine()
    if (current.phase === 'pressing' || current.phase === 'dragging') setMachine({phase: 'idle'})
  })

  const dragStyle = (): JSX.CSSProperties => {
    const current = machine()
    if (current.phase !== 'dragging') return {}
    return {transform: `translate(${current.offsetX}px, ${current.offsetY}px)`}
  }

  const consumeClick = (): boolean => {
    if (suppressClick) {
      suppressClick = false
      return true
    }
    return false
  }

  return {
    position,
    dragging: () => machine().phase === 'dragging' || machine().phase === 'settling',
    dragStyle,
    onPointerDown,
    consumeClick,
  }
}
