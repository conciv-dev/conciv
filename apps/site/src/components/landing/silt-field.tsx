import {useTheme} from 'next-themes'
import {useCallback, useEffect, useState} from 'react'
import {SILT_SETTLE_STEPS, createSiltPainter} from './silt-figure'

const SILT_SEED = 41
const SILT_RENDER_SCALE = 0.4
const SILT_FRAME_INTERVAL_MS = 33

export function SiltField() {
  const {resolvedTheme} = useTheme()
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const captureCanvas = useCallback((node: HTMLCanvasElement | null) => setCanvas(node), [])

  useEffect(() => {
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const styles = window.getComputedStyle(canvas)
    const staysStill = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const themeKey = resolvedTheme ?? 'system'
    let advance: ((steps: number) => void) | null = null
    let handle = 0
    let previous = 0
    let onScreen = false
    let pageVisible = !document.hidden
    let built = ''

    const drift = (now: number) => {
      handle = requestAnimationFrame(drift)
      if (now - previous < SILT_FRAME_INTERVAL_MS) return
      previous = now
      advance?.(1)
    }

    const shouldDrift = () => advance !== null && onScreen && pageVisible && !staysStill

    const start = () => {
      if (handle !== 0) return
      previous = 0
      handle = requestAnimationFrame(drift)
    }

    const stop = () => {
      if (handle === 0) return
      cancelAnimationFrame(handle)
      handle = 0
    }

    const sync = () => {
      if (!shouldDrift()) {
        stop()
        return
      }
      start()
    }

    const readSettings = () => {
      const tint = styles.getPropertyValue('--od-silt-tint').trim()
      const alphaScale = Number(styles.getPropertyValue('--od-silt-alpha'))
      if (!tint) return null
      if (!(alphaScale > 0)) return null
      return {tint, alphaScale}
    }

    const rebuild = (width: number, height: number, tint: string, alphaScale: number) => {
      advance = createSiltPainter(context, {width, height, scale: SILT_RENDER_SCALE, seed: SILT_SEED, tint, alphaScale})
      if (staysStill) advance(SILT_SETTLE_STEPS)
      sync()
    }

    const build = () => {
      const box = canvas.getBoundingClientRect()
      const width = Math.round(box.width)
      const height = Math.round(box.height)
      if (Math.min(width, height) < 1) return
      const key = `${width}x${height}x${themeKey}`
      if (key === built) return
      const settings = readSettings()
      if (!settings) return
      built = key
      rebuild(width, height, settings.tint, settings.alphaScale)
    }

    const trackPageVisibility = () => {
      pageVisible = !document.hidden
      sync()
    }

    const sizeObserver = new ResizeObserver(build)
    sizeObserver.observe(canvas)
    const viewObserver = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting)
      sync()
    })
    viewObserver.observe(canvas)
    document.addEventListener('visibilitychange', trackPageVisibility)

    return () => {
      sizeObserver.disconnect()
      viewObserver.disconnect()
      document.removeEventListener('visibilitychange', trackPageVisibility)
      cancelAnimationFrame(handle)
    }
  }, [canvas, resolvedTheme])

  return <canvas aria-hidden className="size-full" ref={captureCanvas} />
}
