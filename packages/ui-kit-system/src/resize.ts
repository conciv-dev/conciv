import {createSignal, onCleanup} from 'solid-js'
import {readStorage, writeStorage} from './storage.js'

export type Grow = 'up' | 'down' | 'left' | 'right'

const KEY_DIRECTION: Record<Grow, Record<string, 1 | -1>> = {
  left: {ArrowLeft: 1, ArrowRight: -1},
  right: {ArrowRight: 1, ArrowLeft: -1},
  up: {ArrowUp: 1, ArrowDown: -1},
  down: {ArrowDown: 1, ArrowUp: -1},
}

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
  const stored = readStorage(
    opts.storageKey,
    (raw) => {
      const value = Number(raw)
      return Number.isFinite(value) && value >= opts.min ? value : undefined
    },
    opts.initial,
  )
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
      writeStorage(opts.storageKey, size())
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }

  const STEP = 24
  const onKeyDown = (e: KeyboardEvent) => {
    const dir = KEY_DIRECTION[opts.grow()][e.key] ?? 0
    if (dir === 0) return
    e.preventDefault()
    const next = Math.max(opts.min, size() + dir * STEP)
    setSize(next)
    writeStorage(opts.storageKey, next)
  }

  onCleanup(() => cleanup?.())

  return {size, isResizing: resizing, onPointerDown, onKeyDown}
}
