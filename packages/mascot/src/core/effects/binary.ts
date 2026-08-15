import gsap from 'gsap'
import {
  BINARY_EMITTER_COLOR,
  BINARY_EMITTER_DIGIT_COUNT,
  BINARY_EMITTER_DIGIT_LEFT_PX,
  BINARY_EMITTER_DIGIT_TOP_PX,
  BINARY_EMITTER_FONT_FAMILY,
  BINARY_EMITTER_FONT_SIZE_PX,
  BINARY_EMITTER_FONT_WEIGHT,
  BINARY_EMITTER_LANE_OFFSET_PX,
  BINARY_EMITTER_RISE_DURATION_S,
  BINARY_EMITTER_RISE_PX,
  BINARY_EMITTER_STAGGER_S,
  BINARY_EMITTER_TANGENT_OFFSET_DEG,
  ENTER_DURATION_S,
  ENTER_EASE,
} from '../config.js'
import {
  type CurveStyle,
  type EmitterAnchor,
  emitterCurvePoints,
  type EmitterPoint,
  type EmitterRoom,
  measureEmitterRoom,
  resolveCurveStyle,
  stageViewportBounds,
} from '../path.js'
import {antennaTipAnchor} from '../tip-anchor.js'
import {enterFromTip, exitIntoTip} from '../tip-transition.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

export type BinaryEffectConfig = {curve: CurveStyle}

type Rider = {element: HTMLElement; path: EmitterPoint[]}

const DEFAULT_BINARY_CURVE: CurveStyle = 'straight'

const DIGIT_INDEXES = Array.from({length: BINARY_EMITTER_DIGIT_COUNT}, (_, index) => index)

const isLeadingLane = (index: number): boolean => index % 2 === 0

function antennaScaleFactor(antenna: HTMLElement, referenceAntennaPx: number): number {
  const size = Math.min(antenna.offsetWidth, antenna.offsetHeight)
  if (size <= 0) return 1
  return size / referenceAntennaPx
}

const laneOffset = (index: number): number =>
  isLeadingLane(index) ? BINARY_EMITTER_LANE_OFFSET_PX : -BINARY_EMITTER_LANE_OFFSET_PX

function digitGlyph(index: number): HTMLElement {
  const digit = document.createElement('span')
  digit.textContent = isLeadingLane(index) ? '1' : '0'
  return digit
}

function createDigit(factor: number, index: number): HTMLElement {
  const digit = digitGlyph(index)
  const left = (BINARY_EMITTER_DIGIT_LEFT_PX + laneOffset(index)) * factor
  const top = BINARY_EMITTER_DIGIT_TOP_PX * factor
  digit.style.cssText = `position:absolute;left:${left}px;top:${top}px`
  return digit
}

function createRider(factor: number, index: number): HTMLElement {
  const rider = document.createElement('span')
  const left = BINARY_EMITTER_DIGIT_LEFT_PX * factor
  const top = BINARY_EMITTER_DIGIT_TOP_PX * factor
  rider.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:0;height:0`
  const digit = digitGlyph(index)
  digit.style.cssText = `position:absolute;left:${laneOffset(index) * factor}px;top:0`
  rider.append(digit)
  return rider
}

function createShell(tip: EmitterAnchor, factor: number): HTMLElement {
  const element = document.createElement('span')
  element.setAttribute('aria-hidden', 'true')
  element.style.cssText =
    `position:absolute;left:${tip.x}px;top:${tip.y}px;width:0;height:0;pointer-events:none;` +
    `color:${BINARY_EMITTER_COLOR};font-family:${BINARY_EMITTER_FONT_FAMILY};` +
    `font-size:${BINARY_EMITTER_FONT_SIZE_PX * factor}px;` +
    `font-weight:${BINARY_EMITTER_FONT_WEIGHT};line-height:1;will-change:transform,opacity`
  return element
}

function createRiseTimeline(digits: HTMLElement[], factor: number): gsap.core.Timeline {
  gsap.set(digits, {opacity: 0})
  return gsap.timeline().fromTo(
    digits,
    {y: 0, opacity: 0},
    {
      y: BINARY_EMITTER_RISE_PX * factor,
      duration: BINARY_EMITTER_RISE_DURATION_S,
      ease: 'none',
      stagger: {each: BINARY_EMITTER_STAGGER_S, repeat: -1},
      keyframes: {opacity: [0, 1, 1, 0], easeEach: 'none'},
    },
    0,
  )
}

const curveTravel = (path: EmitterPoint[]): gsap.TweenVars => ({
  motionPath: {path, curviness: 0, autoRotate: BINARY_EMITTER_TANGENT_OFFSET_DEG},
  duration: BINARY_EMITTER_RISE_DURATION_S,
  ease: 'none',
  repeat: -1,
})

const curveFade = (): gsap.TweenVars => ({
  keyframes: {opacity: [0, 1, 1, 0], easeEach: 'none'},
  duration: BINARY_EMITTER_RISE_DURATION_S,
  ease: 'none',
  repeat: -1,
})

function createCurveTimeline(riders: Rider[]): gsap.core.Timeline {
  gsap.set(
    riders.map((rider) => rider.element),
    {opacity: 0},
  )
  const timeline = gsap.timeline()
  riders.forEach((rider, index) => {
    const beat = index * BINARY_EMITTER_STAGGER_S
    timeline.to(rider.element, curveTravel(rider.path), beat)
    timeline.to(rider.element, curveFade(), beat)
  })
  return timeline
}

function measuredRoom(context: EffectContext, factor: number): EmitterRoom {
  const {stage, antenna, skin} = context
  const anchor = antennaTipAnchor(stage, antenna, skin)
  return measureEmitterRoom({x: anchor.x / factor, y: anchor.y / factor}, stageViewportBounds(stage, factor))
}

function planRiders(context: EffectContext, factor: number, curve: CurveStyle, elements: HTMLElement[]): Rider[] {
  const room = measuredRoom(context, factor)
  const style = resolveCurveStyle(curve, room)
  if (style === 'straight') return []
  return elements.map((element, index) => ({element, path: emitterCurvePoints(style, room, index, factor)}))
}

const returnToFull = (element: HTMLElement): gsap.core.Tween =>
  gsap.to(element, {scale: 1, opacity: 1, duration: ENTER_DURATION_S, ease: ENTER_EASE})

function createBinaryEmitter(context: EffectContext, curve: CurveStyle): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const element = createShell(antennaTipAnchor(host, antenna, skin), factor)
  const curved = curve !== 'straight'
  const elements = DIGIT_INDEXES.map((index) => (curved ? createRider(factor, index) : createDigit(factor, index)))
  element.append(...elements)
  host.append(element)
  let timeline: gsap.core.Timeline | undefined = curved ? undefined : createRiseTimeline(elements, factor)
  let enter: gsap.core.Tween | undefined
  let exit: gsap.core.Tween | undefined

  const straightAfterCurve = (): gsap.core.Timeline => {
    gsap.set(elements, {x: 0, rotation: 0})
    return createRiseTimeline(elements, factor)
  }

  const rebuildCurve = () => {
    if (!curved) return
    timeline?.kill()
    const riders = planRiders(context, factor, curve, elements)
    timeline = riders.length === 0 ? straightAfterCurve() : createCurveTimeline(riders)
  }

  const anchor = (next: EmitterAnchor) => {
    gsap.set(element, {left: next.x, top: next.y, autoRound: false})
  }

  const remove = () => {
    exit?.kill()
    exit = undefined
    enter?.kill()
    enter = undefined
    timeline?.kill()
    element.remove()
  }

  const start = () => {
    exit?.kill()
    exit = undefined
    rebuildCurve()
    enter = enter === undefined ? enterFromTip(element) : returnToFull(element)
  }

  const stop = (onRemoved: () => void) => {
    if (exit !== undefined) return
    enter?.kill()
    exit = exitIntoTip(element, () => {
      exit = undefined
      remove()
      onRemoved()
    })
  }

  return {start, stop, remove, anchor}
}

export const binaryEffect: EffectMount = (context) => createBinaryEmitter(context, DEFAULT_BINARY_CURVE)

export const configureBinaryEffect =
  (config: BinaryEffectConfig): EffectMount =>
  (context) =>
    createBinaryEmitter(context, config.curve)
