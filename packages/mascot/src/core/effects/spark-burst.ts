import {antennaTipAnchor} from '../tip-anchor.js'
import {
  antennaScaleFactor,
  type CanvasGeometry,
  createSparkCanvas,
  createTipEmitter,
  noEmitterWork,
  runFrameLoop,
  SPARK_ACCENT_COLOR,
  SPARK_COLOR,
  sparkCanvasGeometry,
} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const SPARK_RADIUS_PX = 26

const BURST_SPARK_COUNT = 10

const BURST_DURATION_MS = 520

const EMIT_INTERVAL_MS = 620

const BURST_ANGLES = Array.from({length: BURST_SPARK_COUNT}, (_, index) => (index / BURST_SPARK_COUNT) * Math.PI * 2)

type Spark = {angle: number; birth: number}

type BurstGeometry = CanvasGeometry & {radius: number}

const easeOutCubic = (progress: number): number => 1 - (1 - progress) ** 3

const burstGeometry = (factor: number): BurstGeometry => ({
  ...sparkCanvasGeometry(factor),
  radius: SPARK_RADIUS_PX * factor,
})

function drawBurst(context: CanvasRenderingContext2D, sparks: Spark[], now: number, geometry: BurstGeometry): void {
  context.clearRect(0, 0, geometry.width, geometry.height)
  context.lineWidth = geometry.lineWidth
  sparks.forEach((spark, index) => {
    const eased = easeOutCubic(Math.min(1, (now - spark.birth) / BURST_DURATION_MS))
    const distance = eased * geometry.radius
    const length = geometry.size * (1 - eased)
    context.strokeStyle = index % 2 === 0 ? SPARK_ACCENT_COLOR : SPARK_COLOR
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

function createSparkBurstEmitter(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const geometry = burstGeometry(antennaScaleFactor(antenna, skin.referenceAntennaPx))
  const canvas = createSparkCanvas(antennaTipAnchor(host, antenna, skin), geometry)
  host.append(canvas)
  const canvasContext = canvas.getContext('2d')
  let sparks: Spark[] = []
  let lastEmit = 0
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
    lastEmit = 0
    cancelLoop = runFrameLoop((now) => {
      if (now - lastEmit >= EMIT_INTERVAL_MS) {
        sparks = [...sparks, ...BURST_ANGLES.map((angle) => ({angle, birth: now}))]
        lastEmit = now
      }
      sparks = sparks.filter((spark) => now - spark.birth < BURST_DURATION_MS)
      drawBurst(canvasContext, sparks, now, geometry)
    })
  }

  return createTipEmitter({
    element: canvas,
    origin: {x: geometry.originX, y: geometry.originY},
    onStart: startLoop,
    onStop: noEmitterWork,
    onRemove: clearCanvas,
  })
}

export const sparkBurstEffect: EffectMount = (context) => createSparkBurstEmitter(context)
