import {useTheme} from 'next-themes'
import {useCallback, useEffect, useState} from 'react'
import {cn} from '@/lib/utils'

export type FrameCanvasWatch = {
  staysStill: MediaQueryList
  isAwake: () => boolean
  dispose: () => void
}

export function watchFrameCanvas(
  canvas: HTMLCanvasElement,
  handlers: {onResize: () => void; onWake: () => void},
): FrameCanvasWatch {
  const staysStill = window.matchMedia('(prefers-reduced-motion: reduce)')
  let onScreen = false
  const sizeObserver = new ResizeObserver(handlers.onResize)
  if (canvas.parentElement) sizeObserver.observe(canvas.parentElement)
  const viewObserver = new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting)
    handlers.onWake()
  })
  viewObserver.observe(canvas)
  document.addEventListener('visibilitychange', handlers.onWake)
  staysStill.addEventListener('change', handlers.onWake)

  return {
    staysStill,
    isAwake: () => onScreen && document.visibilityState === 'visible' && !staysStill.matches,
    dispose: () => {
      sizeObserver.disconnect()
      viewObserver.disconnect()
      document.removeEventListener('visibilitychange', handlers.onWake)
      staysStill.removeEventListener('change', handlers.onWake)
    },
  }
}

export function FrameEffectCanvas({
  start,
  className,
}: {
  start: (canvas: HTMLCanvasElement) => () => void
  className?: string
}) {
  const {resolvedTheme} = useTheme()
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const captureCanvas = useCallback((node: HTMLCanvasElement | null) => setCanvas(node), [])

  useEffect(() => {
    if (!canvas) return
    return start(canvas)
  }, [canvas, resolvedTheme, start])

  return <canvas aria-hidden className={cn('size-full', className)} ref={captureCanvas} />
}
