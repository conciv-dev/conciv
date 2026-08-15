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

const SPARK_SIZE_PX = 10

const LINE_WIDTH_PX = 2

const EMIT_INTERVAL_MS = 60

const SPARKS_PER_EMIT = 2

const FOUNTAIN_LIFE_MS = 1200

const FOUNTAIN_GRAVITY_PX_PER_S2 = 95

const FOUNTAIN_CONE_RADIANS = 0.9

const FOUNTAIN_MIN_SPEED_PX_PER_S = 46

const FOUNTAIN_SPEED_SPREAD_PX_PER_S = 30

type Spark = {velocityX: number; velocityY: number; birth: number}

type Geometry = {
  width: number
  height: number
  originX: number
  originY: number
  size: number
  lineWidth: number
  gravity: number
  minSpeed: number
  speedSpread: number
}

function canvasGeometry(factor: number): Geometry {
  return {
    width: CANVAS_WIDTH_PX * factor,
    height: CANVAS_HEIGHT_PX * factor,
    originX: ORIGIN_X_PX * factor,
    originY: ORIGIN_Y_PX * factor,
    size: SPARK_SIZE_PX * factor,
    lineWidth: LINE_WIDTH_PX * factor,
    gravity: FOUNTAIN_GRAVITY_PX_PER_S2 * factor,
    minSpeed: FOUNTAIN_MIN_SPEED_PX_PER_S * factor,
    speedSpread: FOUNTAIN_SPEED_SPREAD_PX_PER_S * factor,
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

function makeFountainSpark(birth: number, geometry: Geometry): Spark {
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * FOUNTAIN_CONE_RADIANS
  const speed = geometry.minSpeed + Math.random() * geometry.speedSpread
  return {velocityX: Math.cos(angle) * speed, velocityY: Math.sin(angle) * speed, birth}
}

function drawFountain(context: CanvasRenderingContext2D, sparks: Spark[], now: number, geometry: Geometry): void {
  context.clearRect(0, 0, geometry.width, geometry.height)
  context.lineWidth = geometry.lineWidth
  sparks.forEach((spark, index) => {
    const age = (now - spark.birth) / 1000
    const progress = Math.min(1, (now - spark.birth) / FOUNTAIN_LIFE_MS)
    const x = geometry.originX + spark.velocityX * age
    const y = geometry.originY + spark.velocityY * age + geometry.gravity * age * age * 0.5
    const heading = Math.atan2(spark.velocityY + geometry.gravity * age, spark.velocityX)
    const length = geometry.size * 0.6 * (1 - progress)
    context.strokeStyle = index % 3 === 0 ? SPARK_COLOR : ACCENT_COLOR
    context.globalAlpha = 1 - progress
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + Math.cos(heading) * length, y + Math.sin(heading) * length)
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

function createSparkFountainEmitter(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const geometry = canvasGeometry(factor)
  const canvas = createCanvas(antennaTipAnchor(host, antenna, skin), geometry)
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
    onStop: stopLoop,
    onRemove: clearCanvas,
  })
}

export const sparkFountainEffect: EffectMount = (context) => createSparkFountainEmitter(context)
