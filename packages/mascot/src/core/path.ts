import gsap from 'gsap'
import {MotionPathPlugin} from 'gsap/MotionPathPlugin'

gsap.registerPlugin(MotionPathPlugin)

export type EmitterPoint = {x: number; y: number}

export type EmitterAnchor = EmitterPoint

export type EmitterBounds = {top: number; left: number; right: number}

export type EmitterRoom = {rise: number; bend: number}

export type CurveStyle = 'straight' | 'arc' | 'hook' | 'fan' | 'auto'

export type ResolvedCurveStyle = Exclude<CurveStyle, 'auto'>

export type BentCurveStyle = Exclude<ResolvedCurveStyle, 'straight'>

const MARGIN = 12
const MIN_RISE = 8
const MAX_RISE = 54
const SHORTFALL_THRESHOLD = 10
const BEND_FACTOR = 1.4
const ROUNDING_PRECISION = 1e9

const CURVE_SAMPLE_COUNT = 60

const CURVE_MEASUREMENT_RESOLUTION = 48

const CURVE_SAMPLES = Array.from({length: CURVE_SAMPLE_COUNT + 1}, (_, index) => index / CURVE_SAMPLE_COUNT)

const roundClean = (value: number): number => Math.round(value * ROUNDING_PRECISION) / ROUNDING_PRECISION

const sideRoom = (value: number): number => Math.max(0, value)

export function measureEmitterRoom(anchor: EmitterAnchor, bounds: EmitterBounds): EmitterRoom {
  const headroom = anchor.y - bounds.top - MARGIN
  const rise = Math.min(MAX_RISE, Math.max(MIN_RISE, headroom))
  const shortfall = MAX_RISE - rise
  if (shortfall < SHORTFALL_THRESHOLD) return {rise, bend: 0}
  const leftRoom = anchor.x - bounds.left - MARGIN
  const rightRoom = bounds.right - anchor.x - MARGIN
  const wanted = roundClean(shortfall * BEND_FACTOR)
  if (rightRoom >= leftRoom) return {rise, bend: Math.min(wanted, sideRoom(rightRoom))}
  return {rise, bend: -Math.min(wanted, sideRoom(leftRoom))}
}

export function stageViewportBounds(stage: HTMLElement, scale: number): EmitterBounds {
  const box = stage.getBoundingClientRect()
  const viewportWidth = document.documentElement.clientWidth
  return {top: -box.top / scale, left: -box.left / scale, right: (viewportWidth - box.left) / scale}
}

type CurveShape = {curviness: number; anchors: (room: EmitterRoom, index: number) => EmitterPoint[]}

const gentleArc: CurveShape = {
  curviness: 1.5,
  anchors: (room) => [
    {x: 0, y: 0},
    {x: 0, y: -room.rise * 0.45},
    {x: room.bend * 0.45, y: -room.rise * 0.9},
    {x: room.bend, y: -room.rise},
  ],
}

const cornerHook: CurveShape = {
  curviness: 1,
  anchors: (room) => [
    {x: 0, y: 0},
    {x: 0, y: -room.rise * 0.72},
    {x: room.bend * 0.34, y: -room.rise},
    {x: room.bend, y: -room.rise * 0.88},
  ],
}

const spreadFan: CurveShape = {
  curviness: 1.4,
  anchors: (room, index) => {
    const lane = 0.55 + index * 0.22
    const lift = 0.86 + (index % 2) * 0.14
    return [
      {x: 0, y: 0},
      {x: 0, y: -room.rise * 0.45 * lift},
      {x: room.bend * 0.4 * lane, y: -room.rise * 0.85 * lift},
      {x: room.bend * lane, y: -room.rise * lift},
    ]
  },
}

const CURVE_SHAPES: Record<BentCurveStyle, CurveShape> = {arc: gentleArc, hook: cornerHook, fan: spreadFan}

const verticalAnchors = (room: EmitterRoom): EmitterPoint[] => [
  {x: 0, y: 0},
  {x: 0, y: -room.rise * 0.5},
  {x: 0, y: -room.rise},
]

export function curveControlPoints(style: BentCurveStyle, room: EmitterRoom, index: number): EmitterPoint[] {
  if (room.bend === 0) return verticalAnchors(room)
  return CURVE_SHAPES[style].anchors(room, index)
}

export function resolveCurveStyle(style: CurveStyle, room: EmitterRoom): ResolvedCurveStyle {
  if (style !== 'auto') return style
  if (room.bend === 0) return 'straight'
  return 'arc'
}

export function emitterCurvePoints(
  style: BentCurveStyle,
  room: EmitterRoom,
  index: number,
  scale: number,
): EmitterPoint[] {
  const anchors = curveControlPoints(style, room, index)
  const rawPath = MotionPathPlugin.cacheRawPathMeasurements(
    MotionPathPlugin.arrayToRawPath(anchors, {curviness: CURVE_SHAPES[style].curviness}),
    CURVE_MEASUREMENT_RESOLUTION,
  )
  return CURVE_SAMPLES.map((progress) => {
    const point = MotionPathPlugin.getPositionOnPath(rawPath, progress)
    return {x: point.x * scale, y: point.y * scale}
  })
}
