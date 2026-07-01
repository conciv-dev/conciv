import {createSignal, onCleanup, type JSX} from 'solid-js'
import type {TriggerPosition} from '@conciv/protocol/config-types'
import {readStorage, writeStorage} from './persisted-signal.js'

// Headless positioning for a floating element: 6 corner/middle presets plus drag-to-reposition
// that snaps to the nearest preset on release and persists the choice. Content-agnostic — the
// modal FAB uses it, but anything floating can. Preset placement mirrors TanStack Devtools'
// trigger positions (MIT); the snap-on-drop is ours.

const MARGIN = 20
const SNAP_MS = 280
const SNAP_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)' // ease-out-expo (matches --pw-ease-expo)
const ALL: TriggerPosition[] = ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right']

// The viewport anchor point (px) a preset resolves to — used to find the nearest on drop.
function anchorOf(p: TriggerPosition, vw: number, vh: number): {x: number; y: number} {
  const x = p.endsWith('left') ? MARGIN : vw - MARGIN
  const y = p.startsWith('top') ? MARGIN : p.startsWith('middle') ? vh / 2 : vh - MARGIN
  return {x, y}
}

// The element CENTER a preset rests at, given the element size — the snap animation glides here so
// it lands exactly on the preset class's resting spot (no jump at commit). Mirrors the CSS presets.
function presetCenter(
  p: TriggerPosition,
  vw: number,
  vh: number,
  halfW: number,
  halfH: number,
): {x: number; y: number} {
  const x = p.endsWith('left') ? MARGIN + halfW : vw - MARGIN - halfW
  const y = p.startsWith('top') ? MARGIN + halfH : p.startsWith('middle') ? vh / 2 : vh - MARGIN - halfH
  return {x, y}
}

function nearestPreset(x: number, y: number, vw: number, vh: number): TriggerPosition {
  let best: TriggerPosition = 'bottom-right'
  let bestDist = Infinity
  for (const p of ALL) {
    const a = anchorOf(p, vw, vh)
    const dist = (a.x - x) ** 2 + (a.y - y) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = p
    }
  }
  return best
}

function reduceMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

// Validates a stored value against the known presets; an unknown string is rejected.
function parsePosition(raw: string): TriggerPosition | undefined {
  return (ALL as string[]).includes(raw) ? (raw as TriggerPosition) : undefined
}

export function createDraggablePosition(opts: {initial: TriggerPosition; storageKey: string}): {
  position: () => TriggerPosition
  dragging: () => boolean
  // Inline style while dragging (follows the pointer); empty otherwise (the preset class places it).
  dragStyle: () => JSX.CSSProperties
  onPointerDown: (e: PointerEvent) => void
  // Call from onClick; returns true when the click should be ignored because it was a drag.
  consumeClick: () => boolean
} {
  const [position, setPosition] = createSignal<TriggerPosition>(
    readStorage(opts.storageKey, parsePosition, opts.initial),
  )
  // Free-position the element by its center (px) while dragging, then while snapping. null = at rest.
  const [point, setPoint] = createSignal<{x: number; y: number} | null>(null)
  const [snapping, setSnapping] = createSignal(false)
  let suppressClick = false
  let cleanup: (() => void) | undefined
  let snapTimer: ReturnType<typeof setTimeout> | undefined

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    const halfW = rect.width / 2
    const halfH = rect.height / 2
    const startX = e.clientX
    const startY = e.clientY
    let moved = false
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 6) moved = true
      if (moved) setPoint({x: ev.clientX, y: ev.clientY})
    }
    const up = (ev: PointerEvent) => {
      cleanup?.()
      cleanup = undefined
      if (!moved) {
        setPoint(null)
        return
      }
      suppressClick = true
      const vw = window.innerWidth
      const vh = window.innerHeight
      const next = nearestPreset(ev.clientX, ev.clientY, vw, vh)
      const commit = () => {
        setPosition(next)
        writeStorage(opts.storageKey, next)
        setPoint(null)
        setSnapping(false)
      }
      // Reduced motion: skip the glide and snap to the preset immediately.
      if (reduceMotion()) {
        commit()
        return
      }
      // Glide from the drop point to the preset's resting center, then commit the preset class.
      setSnapping(true)
      setPoint(presetCenter(next, vw, vh, halfW, halfH))
      snapTimer = setTimeout(commit, SNAP_MS)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }

  onCleanup(() => {
    cleanup?.()
    if (snapTimer) clearTimeout(snapTimer)
  })

  const dragStyle = (): JSX.CSSProperties => {
    const p = point()
    if (!p) return {}
    return {
      position: 'fixed',
      left: `${p.x}px`,
      top: `${p.y}px`,
      right: 'auto',
      bottom: 'auto',
      transform: 'translate(-50%, -50%)',
      // No transition while following the pointer; ease to the corner on release.
      transition: snapping() ? `left ${SNAP_MS}ms ${SNAP_EASE}, top ${SNAP_MS}ms ${SNAP_EASE}` : 'none',
    }
  }

  const consumeClick = (): boolean => {
    if (suppressClick) {
      suppressClick = false
      return true
    }
    return false
  }

  return {position, dragging: () => point() !== null, dragStyle, onPointerDown, consumeClick}
}
