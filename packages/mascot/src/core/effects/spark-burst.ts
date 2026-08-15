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

const SPARK_RADIUS_PX = 26

const BURST_SPARK_COUNT = 10

const BURST_POOL_SIZE = 20

const BURST_DURATION_MS = 520

const EMIT_INTERVAL_MS = 620

const BURST_ANGLES = Array.from({length: BURST_SPARK_COUNT}, (_, index) => (index / BURST_SPARK_COUNT) * Math.PI * 2)

type BurstGeometry = CanvasGeometry & {radius: number}

const easeOutCubic = (progress: number): number => 1 - (1 - progress) ** 3

const valueAt = (values: Float64Array, index: number): number => values[index] ?? 0

const angleAt = (index: number): number => BURST_ANGLES[index] ?? 0

const burstGeometry = (factor: number): BurstGeometry => ({
  ...sparkCanvasGeometry(factor),
  radius: SPARK_RADIUS_PX * factor,
})

function strokeSpark(context: CanvasRenderingContext2D, geometry: BurstGeometry, angle: number, eased: number): void {
  const distance = eased * geometry.radius
  const length = geometry.size * (1 - eased)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  context.globalAlpha = 1 - eased
  context.beginPath()
  context.moveTo(geometry.originX + cos * distance, geometry.originY + sin * distance)
  context.lineTo(geometry.originX + cos * (distance + length), geometry.originY + sin * (distance + length))
  context.stroke()
}

function createSparkBurstEmitter(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const geometry = burstGeometry(antennaScaleFactor(antenna, skin.referenceAntennaPx))
  const {canvas, context: canvasContext} = createSparkCanvas(antennaTipAnchor(host, antenna, skin), geometry)
  host.append(canvas)
  const angles = new Float64Array(BURST_POOL_SIZE)
  const births = new Float64Array(BURST_POOL_SIZE)
  let count = 0
  let lastEmit: number | undefined
  let emitting = false
  let cancelLoop: (() => void) | undefined

  const emit = (now: number) => {
    for (let index = 0; index < BURST_SPARK_COUNT && count < BURST_POOL_SIZE; index += 1) {
      angles[count] = angleAt(index)
      births[count] = now
      count += 1
    }
    lastEmit = now
  }

  const expire = (now: number) => {
    let write = 0
    for (let read = 0; read < count; read += 1) {
      if (now - valueAt(births, read) >= BURST_DURATION_MS) continue
      angles[write] = valueAt(angles, read)
      births[write] = valueAt(births, read)
      write += 1
    }
    count = write
  }

  const paint = (target: CanvasRenderingContext2D, now: number) => {
    target.clearRect(0, 0, geometry.width, geometry.height)
    target.lineWidth = geometry.lineWidth
    for (let index = 0; index < count; index += 1) {
      target.strokeStyle = index % 2 === 0 ? SPARK_ACCENT_COLOR : SPARK_COLOR
      strokeSpark(
        target,
        geometry,
        valueAt(angles, index),
        easeOutCubic((now - valueAt(births, index)) / BURST_DURATION_MS),
      )
    }
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

export const sparkBurstEffect: EffectMount = (context) => createSparkBurstEmitter(context)
