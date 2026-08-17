import {useCallback, useEffect, useState} from 'react'
import {watchFrameCanvas} from './frame-canvas'
import {SYNTH_RIBBON_TIME_STEP, createSynthRibbonPainter} from './synth-ribbon-figure'

const MAX_PIXEL_RATIO = 2
const REFERENCE_FRAME_MS = 1000 / 60
const MAX_STEP_MS = 50
const STATIC_TIME = 3.4

function startSynthRibbon(canvas: HTMLCanvasElement): () => void {
  const context = canvas.getContext('2d', {alpha: true})
  if (!context) return () => {}
  let paint: ((time: number) => void) | null = null
  let built = ''
  let time = STATIC_TIME
  let lastFrameAt = 0
  let frameHandle = 0

  const shouldDrift = () => paint !== null && watch.isAwake()

  const frame = (now: number) => {
    frameHandle = 0
    if (!shouldDrift() || !paint) return
    const step = Math.min(MAX_STEP_MS, now - lastFrameAt)
    lastFrameAt = now
    time += (SYNTH_RIBBON_TIME_STEP * step) / REFERENCE_FRAME_MS
    paint(time)
    frameHandle = requestAnimationFrame(frame)
  }

  const schedule = () => {
    if (frameHandle !== 0 || !shouldDrift()) return
    lastFrameAt = performance.now()
    frameHandle = requestAnimationFrame(frame)
  }

  const measure = () => {
    const parent = canvas.parentElement
    if (!parent) return null
    const width = Math.round(parent.clientWidth)
    const height = Math.round(parent.clientHeight)
    if (Math.min(width, height) < 1) return null
    return {width, height}
  }

  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)

  const rebuild = (figure: {width: number; height: number}, ratio: number) => {
    canvas.width = Math.round(figure.width * ratio)
    canvas.height = Math.round(figure.height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.lineCap = 'round'
    paint = createSynthRibbonPainter(context, figure)
    paint(time)
    schedule()
  }

  const build = () => {
    const figure = measure()
    if (!figure) return
    const ratio = pixelRatio()
    const key = `${figure.width}x${figure.height}x${ratio}`
    if (key === built) return
    built = key
    rebuild(figure, ratio)
  }

  const watch = watchFrameCanvas(canvas, {onResize: build, onWake: schedule})
  build()

  return () => {
    if (frameHandle !== 0) cancelAnimationFrame(frameHandle)
    watch.dispose()
  }
}

export function SynthRibbon() {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const captureCanvas = useCallback((node: HTMLCanvasElement | null) => setCanvas(node), [])

  useEffect(() => {
    if (!canvas) return
    return startSynthRibbon(canvas)
  }, [canvas])

  return <canvas aria-hidden className="size-full" ref={captureCanvas} />
}
