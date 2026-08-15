import gsap from 'gsap'
import {ENTER_DURATION_S, ENTER_EASE} from '../config.js'
import type {EmitterAnchor} from '../path.js'
import {enterFromTip, exitIntoTip} from '../tip-transition.js'
import type {EffectHandle} from './effect.js'

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

export function createSparkCanvas(tip: EmitterAnchor, geometry: CanvasGeometry): HTMLCanvasElement {
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
  return canvas
}

export function runFrameLoop(step: (now: number) => void): () => void {
  let handle = 0
  const frame = (now: number) => {
    step(now)
    handle = requestAnimationFrame(frame)
  }
  handle = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(handle)
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
  element: HTMLElement
  origin: EmitterAnchor
  onStart: () => void
  onStop: () => void
  onRemove: () => void
}

export function createTipEmitter(emitter: TipEmitter): EffectHandle {
  const {element, origin, onStart, onStop, onRemove} = emitter
  let enter: gsap.core.Tween | undefined
  let exit: gsap.core.Tween | undefined

  const anchor = (next: EmitterAnchor) => {
    gsap.set(element, {left: next.x - origin.x, top: next.y - origin.y, autoRound: false})
  }

  const remove = () => {
    exit?.kill()
    exit = undefined
    enter?.kill()
    enter = undefined
    onRemove()
    element.remove()
  }

  const start = () => {
    exit?.kill()
    exit = undefined
    onStart()
    enter = enter === undefined ? enterFromTip(element) : returnToFull(element)
  }

  const stop = (onRemoved: () => void) => {
    if (exit !== undefined) return
    enter?.kill()
    onStop()
    exit = exitIntoTip(element, () => {
      exit = undefined
      remove()
      onRemoved()
    })
  }

  return {start, stop, remove, anchor}
}

export const TIP_ORIGIN: EmitterAnchor = {x: 0, y: 0}

export const noEmitterWork = (): void => undefined

export function createTimelineEmitter(element: HTMLElement, timeline: gsap.core.Timeline): EffectHandle {
  return createTipEmitter({
    element,
    origin: TIP_ORIGIN,
    onStart: noEmitterWork,
    onStop: noEmitterWork,
    onRemove: () => timeline.kill(),
  })
}
