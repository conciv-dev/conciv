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

const EMIT_INTERVAL_MS = 60

const SPARKS_PER_EMIT = 2

const FOUNTAIN_LIFE_MS = 1200

const FOUNTAIN_GRAVITY_PX_PER_S2 = 95

const FOUNTAIN_CONE_RADIANS = 0.9

const FOUNTAIN_MIN_SPEED_PX_PER_S = 46

const FOUNTAIN_SPEED_SPREAD_PX_PER_S = 30

type Spark = {velocityX: number; velocityY: number; birth: number}

type FountainGeometry = CanvasGeometry & {gravity: number; minSpeed: number; speedSpread: number}

const fountainGeometry = (factor: number): FountainGeometry => ({
  ...sparkCanvasGeometry(factor),
  gravity: FOUNTAIN_GRAVITY_PX_PER_S2 * factor,
  minSpeed: FOUNTAIN_MIN_SPEED_PX_PER_S * factor,
  speedSpread: FOUNTAIN_SPEED_SPREAD_PX_PER_S * factor,
})

function makeFountainSpark(birth: number, geometry: FountainGeometry): Spark {
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * FOUNTAIN_CONE_RADIANS
  const speed = geometry.minSpeed + Math.random() * geometry.speedSpread
  return {velocityX: Math.cos(angle) * speed, velocityY: Math.sin(angle) * speed, birth}
}

function drawFountain(
  context: CanvasRenderingContext2D,
  sparks: Spark[],
  now: number,
  geometry: FountainGeometry,
): void {
  context.clearRect(0, 0, geometry.width, geometry.height)
  context.lineWidth = geometry.lineWidth
  sparks.forEach((spark, index) => {
    const age = (now - spark.birth) / 1000
    const progress = Math.min(1, (now - spark.birth) / FOUNTAIN_LIFE_MS)
    const x = geometry.originX + spark.velocityX * age
    const y = geometry.originY + spark.velocityY * age + geometry.gravity * age * age * 0.5
    const heading = Math.atan2(spark.velocityY + geometry.gravity * age, spark.velocityX)
    const length = geometry.size * 0.6 * (1 - progress)
    context.strokeStyle = index % 3 === 0 ? SPARK_COLOR : SPARK_ACCENT_COLOR
    context.globalAlpha = 1 - progress
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + Math.cos(heading) * length, y + Math.sin(heading) * length)
    context.stroke()
  })
  context.globalAlpha = 1
}

function createSparkFountainEmitter(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const geometry = fountainGeometry(antennaScaleFactor(antenna, skin.referenceAntennaPx))
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
        const emitted = Array.from({length: SPARKS_PER_EMIT}, () => makeFountainSpark(now, geometry))
        sparks = [...sparks, ...emitted]
        lastEmit = now
      }
      sparks = sparks.filter((spark) => now - spark.birth < FOUNTAIN_LIFE_MS)
      drawFountain(canvasContext, sparks, now, geometry)
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

export const sparkFountainEffect: EffectMount = (context) => createSparkFountainEmitter(context)
