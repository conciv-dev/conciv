import {antennaTipAnchor} from '../tip-anchor.js'
import {
  antennaScaleFactor,
  type CanvasGeometry,
  createSparkCanvas,
  createTipEmitter,
  runFrameLoop,
  SPARK_ACCENT_COLOR,
  SPARK_COLOR,
  sparkCanvasGeometry,
} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const EMIT_INTERVAL_MS = 60

const SPARKS_PER_EMIT = 2

const FOUNTAIN_POOL_SIZE = 42

const FOUNTAIN_LIFE_MS = 1200

const FOUNTAIN_GRAVITY_PX_PER_S2 = 95

const FOUNTAIN_CONE_RADIANS = 0.9

const FOUNTAIN_MIN_SPEED_PX_PER_S = 46

const FOUNTAIN_SPEED_SPREAD_PX_PER_S = 30

const FOUNTAIN_TRAIL_FRACTION = 0.6

const MILLISECONDS_PER_SECOND = 1000

type FountainGeometry = CanvasGeometry & {gravity: number; minSpeed: number; speedSpread: number}

const valueAt = (values: Float64Array, index: number): number => values[index] ?? 0

const fountainGeometry = (factor: number): FountainGeometry => ({
  ...sparkCanvasGeometry(factor),
  gravity: FOUNTAIN_GRAVITY_PX_PER_S2 * factor,
  minSpeed: FOUNTAIN_MIN_SPEED_PX_PER_S * factor,
  speedSpread: FOUNTAIN_SPEED_SPREAD_PX_PER_S * factor,
})

const launchAngle = (): number => -Math.PI / 2 + (Math.random() - 0.5) * FOUNTAIN_CONE_RADIANS

const launchSpeed = (geometry: FountainGeometry): number => geometry.minSpeed + Math.random() * geometry.speedSpread

function createSparkFountainEmitter(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const geometry = fountainGeometry(antennaScaleFactor(antenna, skin.referenceAntennaPx))
  const {canvas, context: canvasContext} = createSparkCanvas(antennaTipAnchor(host, antenna, skin), geometry)
  host.append(canvas)
  const velocitiesX = new Float64Array(FOUNTAIN_POOL_SIZE)
  const velocitiesY = new Float64Array(FOUNTAIN_POOL_SIZE)
  const births = new Float64Array(FOUNTAIN_POOL_SIZE)
  let count = 0
  let lastEmit: number | undefined
  let emitting = false
  let cancelLoop: (() => void) | undefined

  const emit = (now: number) => {
    for (let index = 0; index < SPARKS_PER_EMIT && count < FOUNTAIN_POOL_SIZE; index += 1) {
      const angle = launchAngle()
      const speed = launchSpeed(geometry)
      velocitiesX[count] = Math.cos(angle) * speed
      velocitiesY[count] = Math.sin(angle) * speed
      births[count] = now
      count += 1
    }
    lastEmit = now
  }

  const expire = (now: number) => {
    let write = 0
    for (let read = 0; read < count; read += 1) {
      if (now - valueAt(births, read) >= FOUNTAIN_LIFE_MS) continue
      velocitiesX[write] = valueAt(velocitiesX, read)
      velocitiesY[write] = valueAt(velocitiesY, read)
      births[write] = valueAt(births, read)
      write += 1
    }
    count = write
  }

  const strokeSpark = (target: CanvasRenderingContext2D, index: number, now: number) => {
    const elapsed = now - valueAt(births, index)
    const age = elapsed / MILLISECONDS_PER_SECOND
    const progress = Math.min(1, elapsed / FOUNTAIN_LIFE_MS)
    const velocityX = valueAt(velocitiesX, index)
    const velocityY = valueAt(velocitiesY, index)
    const x = geometry.originX + velocityX * age
    const y = geometry.originY + velocityY * age + geometry.gravity * age * age * 0.5
    const heading = Math.atan2(velocityY + geometry.gravity * age, velocityX)
    const length = geometry.size * FOUNTAIN_TRAIL_FRACTION * (1 - progress)
    target.strokeStyle = index % 3 === 0 ? SPARK_COLOR : SPARK_ACCENT_COLOR
    target.globalAlpha = 1 - progress
    target.beginPath()
    target.moveTo(x, y)
    target.lineTo(x + Math.cos(heading) * length, y + Math.sin(heading) * length)
    target.stroke()
  }

  const paint = (target: CanvasRenderingContext2D, now: number) => {
    target.clearRect(0, 0, geometry.width, geometry.height)
    target.lineWidth = geometry.lineWidth
    for (let index = 0; index < count; index += 1) strokeSpark(target, index, now)
    target.globalAlpha = 1
  }

  const stopLoop = () => {
    cancelLoop?.()
    cancelLoop = undefined
  }

  const restLoop = () => {
    emitting = false
    stopLoop()
    count = 0
    canvasContext?.clearRect(0, 0, geometry.width, geometry.height)
  }

  const pauseEmission = () => {
    emitting = false
  }

  const startLoop = () => {
    emitting = true
    if (cancelLoop !== undefined || canvasContext === null) return
    count = 0
    lastEmit = undefined
    cancelLoop = runFrameLoop((now) => {
      if (emitting && (lastEmit === undefined || now - lastEmit >= EMIT_INTERVAL_MS)) emit(now)
      expire(now)
      paint(canvasContext, now)
    })
  }

  return createTipEmitter({
    host,
    element: canvas,
    origin: {x: geometry.originX, y: geometry.originY},
    onStart: startLoop,
    onPauseEmission: pauseEmission,
    onRest: restLoop,
    onRemove: restLoop,
  })
}

export const sparkFountainEffect: EffectMount = (context) => createSparkFountainEmitter(context)
