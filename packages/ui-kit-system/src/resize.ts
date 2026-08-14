import {createSignal, onCleanup} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'
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
  max?: () => number
  storageKey?: string
  grow: () => Grow
  collapseAt?: number
  onCollapse?: () => void
}): {
  size: () => number
  set: (next: number) => void
  isResizing: () => boolean
  onPointerDown: (e: PointerEvent) => void
  onKeyDown: (e: KeyboardEvent) => void
} {
  const storageKey = opts.storageKey
  const stored =
    storageKey === undefined
      ? opts.initial
      : readStorage(
          storageKey,
          (raw) => {
            const value = Number(raw)
            return Number.isFinite(value) && value >= opts.min ? value : undefined
          },
          opts.initial,
        )
  const [size, setSize] = createSignal(stored)
  const persist = (value: number) => {
    if (storageKey !== undefined) writeStorage(storageKey, value)
  }
  const bound = (next: number) => {
    const capped = opts.max === undefined ? next : Math.min(next, opts.max())
    return Math.max(opts.min, capped)
  }
  const [resizing, setResizing] = createSignal(false)
  let stopDrag: VoidFunction | undefined

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
      if (opts.collapseAt !== undefined && next < opts.collapseAt) {
        up()
        opts.onCollapse?.()
        return
      }
      setSize(bound(next))
    }
    const up = () => {
      stopDrag?.()
      stopDrag = undefined
      setResizing(false)
      persist(size())
    }
    const clearMove = makeEventListener(window, 'pointermove', move)
    const clearUp = makeEventListener(window, 'pointerup', up)
    stopDrag = () => {
      clearMove()
      clearUp()
    }
  }

  const STEP = 24
  const onKeyDown = (e: KeyboardEvent) => {
    const dir = KEY_DIRECTION[opts.grow()][e.key] ?? 0
    if (dir === 0) return
    e.preventDefault()
    const next = bound(size() + dir * STEP)
    setSize(next)
    persist(next)
  }

  onCleanup(() => stopDrag?.())

  const set = (next: number) => setSize(bound(next))

  return {size, set, isResizing: resizing, onPointerDown, onKeyDown}
}
