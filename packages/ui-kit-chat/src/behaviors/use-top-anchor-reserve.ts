import {createEffect, onCleanup, type Accessor} from 'solid-js'
import {
  computeTopAnchorReserve,
  computeTopAnchorTargetScrollTop,
  createReserveElement,
  createReserveObservers,
  setReserveHeight,
  snapScrollTop,
} from './top-anchor.js'

export type TopAnchorClamp = {tallerThan: number; visibleHeight: number}

export function useTopAnchorReserve(args: {
  viewport: Accessor<HTMLElement | undefined>
  anchorEl: Accessor<HTMLElement | undefined>
  targetEl: Accessor<HTMLElement | undefined>
  clamp: Accessor<TopAnchorClamp | null>
}): void {
  let reserve: HTMLElement | null = null
  let lastScrolledAnchorId: string | undefined
  let frame: number | null = null

  const schedule = () => {
    if (frame !== null) return
    frame = requestAnimationFrame(() => {
      frame = null
      apply()
    })
  }
  const observers = createReserveObservers(schedule)

  const apply = () => {
    const viewport = args.viewport()
    const anchor = args.anchorEl()
    const target = args.targetEl()
    const clamp = args.clamp()
    if (!viewport || !anchor || !target || !clamp) {
      observers.disconnect()
      if (reserve) {
        setReserveHeight(reserve, 0)
        reserve.remove()
      }
      return
    }
    reserve ??= createReserveElement()
    if (reserve.parentElement !== target.parentElement || reserve.previousElementSibling !== target) {
      target.after(reserve)
    }
    observers.observe(viewport, anchor, target)
    const reserveChanged = setReserveHeight(reserve, computeTopAnchorReserve({viewport, anchor, reserve, ...clamp}))
    if (reserveChanged) {
      schedule()
      return
    }
    const anchorId = anchor.dataset.messageId
    if (anchorId !== undefined && lastScrolledAnchorId === anchorId) return
    const targetScrollTop = snapScrollTop(computeTopAnchorTargetScrollTop({viewport, anchor, ...clamp}))
    if (Math.abs(viewport.scrollTop - targetScrollTop) > 1)
      viewport.scrollTo({top: targetScrollTop, behavior: 'smooth'})
    if (anchorId !== undefined) lastScrolledAnchorId = anchorId
  }

  createEffect(() => {
    args.viewport()
    args.anchorEl()
    args.targetEl()
    args.clamp()
    schedule()
  })

  onCleanup(() => {
    if (frame !== null) cancelAnimationFrame(frame)
    observers.disconnect()
    reserve?.remove()
  })
}
