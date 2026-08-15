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
} from '../config.js'
import {
  type CurveStyle,
  emitterCurvePoints,
  type EmitterPoint,
  type EmitterRoom,
  measureEmitterRoom,
  resolveCurveStyle,
  stageViewportBounds,
} from '../path.js'
import {antennaTipAnchor} from '../tip-anchor.js'
import {
  antennaScaleFactor,
  createTipEmitter,
  createTipShell,
  noEmitterWork,
  TIP_ORIGIN,
  WILL_CHANGE_STYLE,
} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

export type BinaryEffectConfig = {curve: CurveStyle}

type Rider = {element: HTMLElement; path: EmitterPoint[]}

const DEFAULT_BINARY_CURVE: CurveStyle = 'straight'

const DIGIT_INDEXES = Array.from({length: BINARY_EMITTER_DIGIT_COUNT}, (_, index) => index)

const isLeadingLane = (index: number): boolean => index % 2 === 0

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

const digitShellStyle = (factor: number): string =>
  `color:${BINARY_EMITTER_COLOR};font-family:${BINARY_EMITTER_FONT_FAMILY};` +
  `font-size:${BINARY_EMITTER_FONT_SIZE_PX * factor}px;` +
  `font-weight:${BINARY_EMITTER_FONT_WEIGHT};line-height:1;${WILL_CHANGE_STYLE}`

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

function createBinaryEmitter(context: EffectContext, curve: CurveStyle): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const element = createTipShell(antennaTipAnchor(host, antenna, skin), digitShellStyle(factor))
  const curved = curve !== 'straight'
  const elements = DIGIT_INDEXES.map((index) => (curved ? createRider(factor, index) : createDigit(factor, index)))
  element.append(...elements)
  host.append(element)
  let timeline: gsap.core.Timeline | undefined

  const buildStraight = (): gsap.core.Timeline => {
    gsap.set(elements, {x: 0, rotation: 0})
    return createRiseTimeline(elements, factor)
  }

  const buildCurve = (): gsap.core.Timeline => {
    const riders = planRiders(context, factor, curve, elements)
    if (riders.length === 0) return buildStraight()
    return createCurveTimeline(riders)
  }

  const clearTimeline = () => {
    timeline?.kill()
    timeline = undefined
  }

  const startTimeline = () => {
    if (!curved) {
      timeline = timeline ?? buildStraight()
      return
    }
    clearTimeline()
    timeline = buildCurve()
  }

  return createTipEmitter({
    host,
    element,
    origin: TIP_ORIGIN,
    onStart: startTimeline,
    onPauseEmission: noEmitterWork,
    onRest: clearTimeline,
    onRemove: clearTimeline,
  })
}

export const binaryEffect: EffectMount = (context) => createBinaryEmitter(context, DEFAULT_BINARY_CURVE)

export const configureBinaryEffect =
  (config: BinaryEffectConfig): EffectMount =>
  (context) =>
    createBinaryEmitter(context, config.curve)
