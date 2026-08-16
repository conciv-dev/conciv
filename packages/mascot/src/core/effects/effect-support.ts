import gsap from 'gsap'
import {ENTER_DURATION_S, ENTER_EASE} from '../config.js'
import type {EmitterAnchor, EmitterPoint} from '../path.js'
import {antennaTipAnchor} from '../tip-anchor.js'
import {enterFromTip, exitIntoTip} from '../tip-transition.js'
import type {EffectContext, EffectHandle} from './effect.js'

export const WILL_CHANGE_STYLE = 'will-change:transform,opacity'

export const SPARK_COLOR = '#ffd23f'

export const SPARK_ACCENT_COLOR = '#e0218a'

const SPARK_CANVAS_WIDTH_PX = 120

const SPARK_CANVAS_HEIGHT_PX = 104

const SPARK_ORIGIN_X_PX = 60

const SPARK_ORIGIN_Y_PX = 96

const SPARK_SIZE_PX = 10

const SPARK_LINE_WIDTH_PX = 2

export type CanvasGeometry = {
  width: number
  height: number
  originX: number
  originY: number
  size: number
  lineWidth: number
}

export function sparkCanvasGeometry(factor: number): CanvasGeometry {
  return {
    width: SPARK_CANVAS_WIDTH_PX * factor,
    height: SPARK_CANVAS_HEIGHT_PX * factor,
    originX: SPARK_ORIGIN_X_PX * factor,
    originY: SPARK_ORIGIN_Y_PX * factor,
    size: SPARK_SIZE_PX * factor,
    lineWidth: SPARK_LINE_WIDTH_PX * factor,
  }
}

export type SparkCanvas = {canvas: HTMLCanvasElement; context: CanvasRenderingContext2D | null}

export function createSparkCanvas(tip: EmitterAnchor, geometry: CanvasGeometry): SparkCanvas {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText =
    `position:absolute;left:${tip.x - geometry.originX}px;top:${tip.y - geometry.originY}px;` +
    `width:${geometry.width}px;height:${geometry.height}px;pointer-events:none;${WILL_CHANGE_STYLE}`
  const ratio = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
  canvas.width = geometry.width * ratio
  canvas.height = geometry.height * ratio
  const context = canvas.getContext('2d')
  context?.scale(ratio, ratio)
  return {canvas, context}
}

const MILLISECONDS_PER_SECOND = 1000

export function runFrameLoop(step: (now: number) => void): () => void {
  const tick = (time: number) => step(time * MILLISECONDS_PER_SECOND)
  gsap.ticker.add(tick)
  return () => gsap.ticker.remove(tick)
}

export function createTipShell(tip: EmitterAnchor, style: string): HTMLElement {
  const element = document.createElement('span')
  element.setAttribute('aria-hidden', 'true')
  element.style.cssText = `position:absolute;left:${tip.x}px;top:${tip.y}px;width:0;height:0;pointer-events:none;${style}`
  return element
}

export function antennaScaleFactor(antenna: HTMLElement, referenceAntennaPx: number): number {
  const size = Math.min(antenna.offsetWidth, antenna.offsetHeight)
  if (size <= 0) return 1
  return size / referenceAntennaPx
}

const returnToFull = (element: HTMLElement): gsap.core.Tween =>
  gsap.to(element, {scale: 1, opacity: 1, duration: ENTER_DURATION_S, ease: ENTER_EASE})

export type TipEmitter = {
  host: HTMLElement
  element: HTMLElement
  origin: EmitterAnchor
  onStart: () => void
  onPauseEmission: () => void
  onRest: () => void
  onRemove: () => void
}

function placedTipOf(element: HTMLElement, origin: EmitterAnchor): EmitterAnchor {
  const left = Number.parseFloat(element.style.left)
  const top = Number.parseFloat(element.style.top)
  if (Number.isNaN(left) || Number.isNaN(top)) {
    throw new Error('a tip emitter needs inline left and top in pixels before it can be anchored')
  }
  return {x: left + origin.x, y: top + origin.y}
}

export function createTipEmitter(emitter: TipEmitter): EffectHandle {
  const {host, element, origin, onStart, onPauseEmission, onRest, onRemove} = emitter
  const placed = placedTipOf(element, origin)
  gsap.set(element, {x: 0, y: 0})
  const shiftX = gsap.quickSetter(element, 'x', 'px')
  const shiftY = gsap.quickSetter(element, 'y', 'px')
  let enter: gsap.core.Tween | undefined
  let exit: gsap.core.Tween | undefined

  const anchor = (next: EmitterAnchor) => {
    shiftX(next.x - placed.x)
    shiftY(next.y - placed.y)
  }

  const killTweens = () => {
    exit?.kill()
    exit = undefined
    enter?.kill()
    enter = undefined
  }

  const rest = () => {
    killTweens()
    onRest()
    element.remove()
  }

  const remove = () => {
    killTweens()
    onRemove()
    element.remove()
  }

  const start = () => {
    exit?.kill()
    exit = undefined
    if (!element.isConnected) host.append(element)
    onStart()
    enter = enter === undefined ? enterFromTip(element) : returnToFull(element)
  }

  const stop = (onRested: () => void) => {
    if (exit !== undefined) return
    enter?.kill()
    onPauseEmission()
    exit = exitIntoTip(element, () => {
      exit = undefined
      rest()
      onRested()
    })
  }

  return {start, stop, rest, remove, anchor}
}

export const TIP_ORIGIN: EmitterAnchor = {x: 0, y: 0}

export const noEmitterWork = (): void => undefined

export function createTimelineEmitter(
  host: HTMLElement,
  element: HTMLElement,
  buildTimeline: () => gsap.core.Timeline,
): EffectHandle {
  let timeline: gsap.core.Timeline | undefined
  const clearTimeline = () => {
    timeline?.kill()
    timeline = undefined
  }

  return createTipEmitter({
    host,
    element,
    origin: TIP_ORIGIN,
    onStart: () => {
      timeline = timeline ?? buildTimeline()
    },
    onPauseEmission: noEmitterWork,
    onRest: clearTimeline,
    onRemove: clearTimeline,
  })
}

export type NozzleEmitter = {
  host: HTMLElement
  element: HTMLElement
  mouth: EmitterAnchor
  buildTimeline: (nozzle: EmitterPoint) => gsap.core.Timeline
}

export function createNozzleEmitter(emitter: NozzleEmitter): EffectHandle {
  const {host, element, mouth, buildTimeline} = emitter
  const nozzle: EmitterPoint = {x: 0, y: 0}
  let timeline: gsap.core.Timeline | undefined
  const clearTimeline = () => {
    timeline?.kill()
    timeline = undefined
  }

  const aimNozzle = (tip: EmitterAnchor) => {
    nozzle.x = tip.x - mouth.x
    nozzle.y = tip.y - mouth.y
  }

  const tip = createTipEmitter({
    host,
    element,
    origin: TIP_ORIGIN,
    onStart: () => {
      timeline = timeline ?? buildTimeline(nozzle)
    },
    onPauseEmission: noEmitterWork,
    onRest: clearTimeline,
    onRemove: clearTimeline,
  })

  return {...tip, anchor: aimNozzle}
}

export type ParticleNozzle = {
  context: EffectContext
  shellStyle?: (factor: number) => string
  createParticles: (factor: number) => HTMLElement[]
  buildTimeline: (particles: HTMLElement[], factor: number, nozzle: EmitterPoint) => gsap.core.Timeline
}

export function createParticleNozzleEmitter(nozzle: ParticleNozzle): EffectHandle {
  const {host, antenna, skin} = nozzle.context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const mouth = antennaTipAnchor(host, antenna, skin)
  const element = createTipShell(mouth, nozzle.shellStyle?.(factor) ?? WILL_CHANGE_STYLE)
  const particles = nozzle.createParticles(factor)
  element.append(...particles)
  host.append(element)
  return createNozzleEmitter({
    host,
    element,
    mouth,
    buildTimeline: (aimed) => nozzle.buildTimeline(particles, factor, aimed),
  })
}
