import {createSignal, onCleanup} from 'solid-js'

export type Grow = 'up' | 'down' | 'left' | 'right'

// Edge-drag resize on one axis, adapted from TanStack Devtools' handleDragStart (MIT). Devtools
// docks to an edge and resizes off the pointer delta, collapsing below a threshold. Ours floats in
// a corner, so `grow` says which drag direction enlarges it: 'up'/'down' resize height (drag the
// top/bottom edge), 'left'/'right' resize width (drag the left/right edge). Pick `grow` from which
// edge is free (away from the anchored corner).
export function createResizable(opts: {
  initial: number
  min: number
  storageKey: string
  grow: () => Grow
  collapseAt?: number
  onCollapse?: () => void
}): {
  size: () => number
  isResizing: () => boolean
  onPointerDown: (e: PointerEvent) => void
  onKeyDown: (e: KeyboardEvent) => void
} {
  let stored = opts.initial
  try {
    const v = Number(localStorage.getItem(opts.storageKey))
    if (Number.isFinite(v) && v >= opts.min) stored = v
  } catch {
    // storage unavailable — use the initial size
  }
  const [size, setSize] = createSignal(stored)
  const [resizing, setResizing] = createSignal(false)
  let cleanup: (() => void) | undefined

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    setResizing(true)
    const startSize = size()
    const grow = opts.grow()
    const horizontal = grow === 'left' || grow === 'right'
    const start = horizontal ? e.clientX : e.clientY
    // 'down'/'right' grow as the pointer increases; 'up'/'left' grow as it decreases.
    const positive = grow === 'down' || grow === 'right'

    const move = (ev: PointerEvent) => {
      const cur = horizontal ? ev.clientX : ev.clientY
      const delta = positive ? cur - start : start - cur
      const next = startSize + delta
      if (opts.collapseAt !== undefined && next < opts.collapseAt) opts.onCollapse?.()
      setSize(Math.max(opts.min, next))
    }
    const up = () => {
      cleanup?.()
      cleanup = undefined
      setResizing(false)
      try {
        localStorage.setItem(opts.storageKey, String(size()))
      } catch {
        // storage unavailable — keep the in-memory size
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }

  // Keyboard resize: arrow keys nudge by a step, mirroring the drag direction (the key pointing
  // toward `grow` enlarges). Persists like a drag does.
  const STEP = 24
  const onKeyDown = (e: KeyboardEvent) => {
    const grow = opts.grow()
    const horizontal = grow === 'left' || grow === 'right'
    let dir = 0
    if (horizontal && e.key === 'ArrowLeft') dir = grow === 'left' ? 1 : -1
    else if (horizontal && e.key === 'ArrowRight') dir = grow === 'right' ? 1 : -1
    else if (!horizontal && e.key === 'ArrowUp') dir = grow === 'up' ? 1 : -1
    else if (!horizontal && e.key === 'ArrowDown') dir = grow === 'down' ? 1 : -1
    if (dir === 0) return
    e.preventDefault()
    const next = Math.max(opts.min, size() + dir * STEP)
    setSize(next)
    try {
      localStorage.setItem(opts.storageKey, String(next))
    } catch {
      // storage unavailable — keep the in-memory size
    }
  }

  onCleanup(() => cleanup?.())

  return {size, isResizing: resizing, onPointerDown, onKeyDown}
}
