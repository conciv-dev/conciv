import type {EmitterAnchor} from '../path.js'
import {antennaTipAnchor} from '../tip-anchor.js'
import {antennaScaleFactor, createTipEmitter} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const SPARK_COLOR = '#ffd23f'

const ACCENT_COLOR = '#e0218a'

const CANVAS_WIDTH_PX = 120

const CANVAS_HEIGHT_PX = 104

const ORIGIN_X_PX = 60

const ORIGIN_Y_PX = 96

const SPARK_RADIUS_PX = 26

const SPARK_SIZE_PX = 10

const LINE_WIDTH_PX = 2

const BURST_SPARK_COUNT = 10

const BURST_DURATION_MS = 520

const BURST_INTERVAL_MS = 620

const BURST_ANGLES = Array.from({length: BURST_SPARK_COUNT}, (_, index) => (index / BURST_SPARK_COUNT) * Math.PI * 2)

type Spark = {angle: number; birth: number}

type Geometry = {
  width: number
  height: number
  originX: number
  originY: number
  radius: number
  size: number
  lineWidth: number
}

const easeOutCubic = (progress: number): number => 1 - (1 - progress) ** 3

function canvasGeometry(factor: number): Geometry {
  return {
    width: CANVAS_WIDTH_PX * factor,
    height: CANVAS_HEIGHT_PX * factor,
    originX: ORIGIN_X_PX * factor,
    originY: ORIGIN_Y_PX * factor,
    radius: SPARK_RADIUS_PX * factor,
    size: SPARK_SIZE_PX * factor,
    lineWidth: LINE_WIDTH_PX * factor,
  }
}

function createCanvas(tip: EmitterAnchor, geometry: Geometry): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText =
    `position:absolute;left:${tip.x - geometry.originX}px;top:${tip.y - geometry.originY}px;` +
    `width:${geometry.width}px;height:${geometry.height}px;pointer-events:none;will-change:transform,opacity`
  const ratio = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
  canvas.width = geometry.width * ratio
  canvas.height = geometry.height * ratio
  const context = canvas.getContext('2d')
  context?.scale(ratio, ratio)
  return canvas
}

function drawBurst(context: CanvasRenderingContext2D, sparks: Spark[], now: number, geometry: Geometry): void {
  context.clearRect(0, 0, geometry.width, geometry.height)
  context.lineWidth = geometry.lineWidth
  sparks.forEach((spark, index) => {
    const eased = easeOutCubic(Math.min(1, (now - spark.birth) / BURST_DURATION_MS))
    const distance = eased * geometry.radius
    const length = geometry.size * (1 - eased)
    context.strokeStyle = index % 2 === 0 ? ACCENT_COLOR : SPARK_COLOR
    context.globalAlpha = 1 - eased
    context.beginPath()
    context.moveTo(
      geometry.originX + Math.cos(spark.angle) * distance,
      geometry.originY + Math.sin(spark.angle) * distance,
    )
    context.lineTo(
      geometry.originX + Math.cos(spark.angle) * (distance + length),
      geometry.originY + Math.sin(spark.angle) * (distance + length),
    )
    context.stroke()
  })
  context.globalAlpha = 1
}

function runFrameLoop(step: (now: number) => void): () => void {
  let handle = 0
  const frame = (now: number) => {
    step(now)
    handle = requestAnimationFrame(frame)
  }
  handle = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(handle)
}

function createSparkBurstEmitter(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const geometry = canvasGeometry(factor)
  const canvas = createCanvas(antennaTipAnchor(host, antenna, skin), geometry)
  host.append(canvas)
  const canvasContext = canvas.getContext('2d')
  let sparks: Spark[] = []
  let lastBurst = -BURST_INTERVAL_MS
  let cancelLoop: (() => void) | undefined

  const stopLoop = () => {
    cancelLoop?.()
    cancelLoop = undefined
  }

  const clearCanvas = () => {
    stopLoop()
    canvasContext?.clearRect(0, 0, geometry.width, geometry.height)
  }

  const startLoop = () => {
    if (cancelLoop !== undefined || canvasContext === null) return
    sparks = []
    lastBurst = -BURST_INTERVAL_MS
    cancelLoop = runFrameLoop((now) => {
      if (now - lastBurst >= BURST_INTERVAL_MS) {
        sparks = [...sparks, ...BURST_ANGLES.map((angle) => ({angle, birth: now}))]
        lastBurst = now
      }
      sparks = sparks.filter((spark) => now - spark.birth < BURST_DURATION_MS)
      drawBurst(canvasContext, sparks, now, geometry)
    })
  }

  return createTipEmitter({
    element: canvas,
    origin: {x: geometry.originX, y: geometry.originY},
    onStart: startLoop,
    onStop: stopLoop,
    onRemove: clearCanvas,
  })
}

export const sparkBurstEffect: EffectMount = (context) => createSparkBurstEmitter(context)
