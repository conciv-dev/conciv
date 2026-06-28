import {createEffect, onCleanup, type Accessor} from 'solid-js'

// Pin a new user turn (anchorEl) to the top of the viewport and reserve a spacer on the streaming
// assistant target (targetEl) so the answer can scroll up into view as it grows. Re-pins on resize /
// mutation. The clamp keeps the reserve from over/under-shooting (tallerThan / visibleHeight in px).
export function useTopAnchorReserve(args: {
  viewport: Accessor<HTMLElement | undefined>
  anchorEl: Accessor<HTMLElement | undefined>
  targetEl: Accessor<HTMLElement | undefined>
  clamp: {tallerThan: number; visibleHeight: number}
}): void {
  createEffect(() => {
    const viewport = args.viewport()
    const anchor = args.anchorEl()
    if (!viewport || !anchor) return
    const apply = () => {
      const target = args.targetEl()
      if (target) {
        const reserve = Math.max(0, viewport.clientHeight - args.clamp.visibleHeight)
        target.style.minHeight = `${reserve}px`
      }
      viewport.scrollTop = Math.max(0, anchor.offsetTop - 8)
    }
    apply()
    const resize = new ResizeObserver(apply)
    resize.observe(viewport)
    const target = args.targetEl()
    if (target) resize.observe(target)
    onCleanup(() => {
      resize.disconnect()
      const cleanupTarget = args.targetEl()
      if (cleanupTarget) cleanupTarget.style.minHeight = ''
    })
  })
}
