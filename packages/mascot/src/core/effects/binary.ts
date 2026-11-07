import gsap from 'gsap'
import {
  BINARY_EMITTER_CLEARANCE_PX,
  BINARY_EMITTER_COLOR,
  BINARY_EMITTER_DIGIT_COUNT,
  BINARY_EMITTER_DIGIT_LEFT_PX,
  BINARY_EMITTER_DIGIT_TOP_PX,
  BINARY_EMITTER_FONT_FAMILY,
  BINARY_EMITTER_FONT_SIZE_PX,
  BINARY_EMITTER_FONT_WEIGHT,
  BINARY_EMITTER_LANE_OFFSET_PX,
  BINARY_EMITTER_REACH_PX,
  BINARY_EMITTER_RISE_DURATION_S,
  BINARY_EMITTER_RISE_PX,
  BINARY_EMITTER_STAGGER_S,
  BINARY_EMITTER_TANGENT_OFFSET_DEG,
} from '../config.js'
import {
  type CurveStyle,
  detourAround,
  emitterCurvePoints,
  type EmitterAnchor,
  type EmitterBounds,
  type EmitterFootprint,
  type EmitterPoint,
  type EmitterRect,
  measureEmitterRoom,
  resolveCurveStyle,
  stageLocalBounds,
  stageLocalRect,
  viewportBounds,
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

export type BinaryEffectConfig = {curve?: CurveStyle; avoid?: () => EmitterRect | undefined}

type BinaryPlan = {curve: CurveStyle; avoid: (() => EmitterRect | undefined) | undefined}

type RoomReading = {tip: EmitterAnchor; bounds: EmitterBounds; obstacle: EmitterRect | undefined}

type Rider = {element: HTMLElement; path: EmitterPoint[]}

type CurvePath = {
  path: EmitterPoint[]
  curviness: number
  autoRotate: number
  fromCurrent: boolean
  offsetX: number
  offsetY: number
}

type CurveFlight = {element: HTMLElement; motionPath: CurvePath}

type TravellingFlight = CurveFlight & {travel: gsap.core.Tween}

type CurveRun = {timeline: gsap.core.Timeline; flights: TravellingFlight[]}

const DEFAULT_BINARY_CURVE: CurveStyle = 'auto'

const DETOUR_FOOTPRINT: EmitterFootprint = {reach: BINARY_EMITTER_REACH_PX, clearance: BINARY_EMITTER_CLEARANCE_PX}

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

const riseLaunch = (nozzle: EmitterPoint): gsap.TweenVars => ({
  x: () => nozzle.x,
  y: () => nozzle.y,
  opacity: 0,
})

const riseTravel = (nozzle: EmitterPoint, factor: number): gsap.TweenVars => ({
  x: () => nozzle.x,
  y: () => nozzle.y + BINARY_EMITTER_RISE_PX * factor,
  duration: BINARY_EMITTER_RISE_DURATION_S,
  ease: 'none',
  repeat: -1,
  repeatRefresh: true,
  immediateRender: false,
  keyframes: {opacity: [0, 1, 1, 0], easeEach: 'none'},
})

function createRiseTimeline(digits: HTMLElement[], factor: number, nozzle: EmitterPoint): gsap.core.Timeline {
  gsap.set(digits, {opacity: 0})
  const timeline = gsap.timeline()
  digits.forEach((digit, index) => {
    timeline.fromTo(digit, riseLaunch(nozzle), riseTravel(nozzle, factor), index * BINARY_EMITTER_STAGGER_S)
  })
  return timeline
}

const curvePathOf = (path: EmitterPoint[], nozzle: EmitterPoint): CurvePath => ({
  path,
  curviness: 0,
  autoRotate: BINARY_EMITTER_TANGENT_OFFSET_DEG,
  fromCurrent: false,
  offsetX: nozzle.x,
  offsetY: nozzle.y,
})

const curveTravel = (motionPath: CurvePath): gsap.TweenVars => ({
  motionPath,
  duration: BINARY_EMITTER_RISE_DURATION_S,
  ease: 'none',
  repeat: -1,
  repeatRefresh: true,
})

const curveFade = (): gsap.TweenVars => ({
  keyframes: {opacity: [0, 1, 1, 0], easeEach: 'none'},
  duration: BINARY_EMITTER_RISE_DURATION_S,
  ease: 'none',
  repeat: -1,
})

const planFlights = (riders: Rider[], nozzle: EmitterPoint): CurveFlight[] =>
  riders.map((rider) => ({element: rider.element, motionPath: curvePathOf(rider.path, nozzle)}))

function createCurveRun(flights: CurveFlight[]): CurveRun {
  gsap.set(
    flights.map((flight) => flight.element),
    {opacity: 0},
  )
  const timeline = gsap.timeline()
  const travelling = flights.map((flight, index) => {
    const beat = index * BINARY_EMITTER_STAGGER_S
    const travel = gsap.to(flight.element, curveTravel(flight.motionPath))
    timeline.add(travel, beat)
    timeline.to(flight.element, curveFade(), beat)
    return {...flight, travel}
  })
  return {timeline, flights: travelling}
}

function readRoom(context: EffectContext, factor: number, avoid: BinaryPlan['avoid']): RoomReading {
  const {stage, antenna, skin} = context
  const box = stage.getBoundingClientRect()
  const anchor = antennaTipAnchor(stage, antenna, skin)
  const obstacle = avoid?.()
  return {
    tip: {x: anchor.x / factor, y: anchor.y / factor},
    bounds: stageLocalBounds(box, factor, viewportBounds()),
    obstacle: obstacle === undefined ? undefined : stageLocalRect(box, factor, obstacle),
  }
}

function detourOf(reading: RoomReading): EmitterPoint[] | undefined {
  const start = {x: reading.tip.x + BINARY_EMITTER_DIGIT_LEFT_PX, y: reading.tip.y + BINARY_EMITTER_DIGIT_TOP_PX}
  return detourAround(start, reading.bounds, reading.obstacle, DETOUR_FOOTPRINT)
}

const scaledPath = (points: EmitterPoint[], factor: number): EmitterPoint[] =>
  points.map((point) => ({x: point.x * factor, y: point.y * factor}))

const risePath = (factor: number): EmitterPoint[] => [
  {x: 0, y: 0},
  {x: 0, y: BINARY_EMITTER_RISE_PX * factor},
]

function planRiders(context: EffectContext, factor: number, plan: BinaryPlan, elements: HTMLElement[]): Rider[] {
  const reading = readRoom(context, factor, plan.avoid)
  const detour = plan.avoid === undefined ? undefined : detourOf(reading)
  if (detour !== undefined) {
    const path = scaledPath(detour, factor)
    return elements.map((element) => ({element, path}))
  }
  const room = measureEmitterRoom(reading.tip, reading.bounds)
  const style = resolveCurveStyle(plan.curve, room)
  if (style !== 'straight') {
    return elements.map((element, index) => ({element, path: emitterCurvePoints(style, room, index, factor)}))
  }
  if (plan.avoid === undefined) return []
  return elements.map((element) => ({element, path: risePath(factor)}))
}

function createBinaryEmitter(context: EffectContext, plan: BinaryPlan): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const mouth = antennaTipAnchor(host, antenna, skin)
  const element = createTipShell(mouth, digitShellStyle(factor))
  const curved = plan.curve !== 'straight'
  const elements = DIGIT_INDEXES.map((index) => (curved ? createRider(factor, index) : createDigit(factor, index)))
  element.append(...elements)
  host.append(element)
  const nozzle: EmitterPoint = {x: 0, y: 0}
  let flights: TravellingFlight[] = []
  let timeline: gsap.core.Timeline | undefined
  let pendingReplan: gsap.core.Tween | undefined

  const aimFlight = (flight: CurveFlight) => {
    flight.motionPath.offsetX = nozzle.x
    flight.motionPath.offsetY = nozzle.y
  }

  const aimNozzle = (tip: EmitterAnchor) => {
    nozzle.x = tip.x - mouth.x
    nozzle.y = tip.y - mouth.y
    flights.forEach(aimFlight)
  }

  const buildStraight = (): gsap.core.Timeline => {
    gsap.set(elements, {x: 0, y: 0, rotation: 0})
    return createRiseTimeline(elements, factor, nozzle)
  }

  const buildCurve = (): gsap.core.Timeline => {
    const riders = planRiders(context, factor, plan, elements)
    if (riders.length === 0) return buildStraight()
    const run = createCurveRun(planFlights(riders, nozzle))
    flights = run.flights
    return run.timeline
  }

  const clearTimeline = () => {
    pendingReplan?.kill()
    pendingReplan = undefined
    timeline?.kill()
    timeline = undefined
    flights = []
  }

  const startTimeline = () => {
    if (!curved) {
      timeline = timeline ?? buildStraight()
      return
    }
    clearTimeline()
    timeline = buildCurve()
  }

  const retarget = () => {
    pendingReplan = undefined
    if (timeline === undefined || !curved) return
    const riders = planRiders(context, factor, plan, elements)
    if (riders.length !== flights.length) {
      startTimeline()
      return
    }
    riders.forEach((rider, index) => {
      const flight = flights[index]
      if (flight === undefined) return
      flight.motionPath.path = rider.path
      flight.travel.invalidate()
    })
  }

  const replan = () => {
    pendingReplan = pendingReplan ?? gsap.delayedCall(0, retarget)
  }

  const emitter = createTipEmitter({
    host,
    element,
    origin: TIP_ORIGIN,
    onStart: startTimeline,
    onPauseEmission: noEmitterWork,
    onRest: clearTimeline,
    onRemove: clearTimeline,
  })

  return {...emitter, anchor: aimNozzle, replan}
}

export const binaryEffect: EffectMount = (context) =>
  createBinaryEmitter(context, {curve: DEFAULT_BINARY_CURVE, avoid: undefined})

export const configureBinaryEffect =
  (config: BinaryEffectConfig): EffectMount =>
  (context) =>
    createBinaryEmitter(context, {curve: config.curve ?? DEFAULT_BINARY_CURVE, avoid: config.avoid})
