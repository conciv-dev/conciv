import gsap from 'gsap'
import {MotionPathPlugin} from 'gsap/MotionPathPlugin'

gsap.registerPlugin(MotionPathPlugin)

export type EmitterPoint = {x: number; y: number}

export type EmitterAnchor = EmitterPoint

export type EmitterBounds = {top: number; left: number; right: number}

export type EmitterRoom = {rise: number; bend: number}

export type EmitterRect = {top: number; left: number; right: number; bottom: number}

export type EmitterFootprint = {reach: number; clearance: number}

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

const DETOUR_CORNER_RADIUS = 8
const DETOUR_CLIMB = MAX_RISE * 2
const DETOUR_CORNER_STEPS = 6
const DETOUR_CORNER_PROGRESS = Array.from({length: DETOUR_CORNER_STEPS + 1}, (_, index) => index / DETOUR_CORNER_STEPS)

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

export function detourAround(
  start: EmitterPoint,
  bounds: EmitterBounds,
  obstacle: EmitterRect | undefined,
  footprint: EmitterFootprint,
): EmitterPoint[] | undefined {
  const blocking = [obstacle, viewportCeiling(bounds)].filter(
    (candidate): candidate is EmitterRect => candidate !== undefined && blocksRise(start, candidate, footprint),
  )
  const nearest = blocking.toSorted((first, second) => second.bottom - first.bottom)[0]
  if (nearest === undefined) return undefined
  const runY = Math.min(start.y, Math.max(nearest.bottom + footprint.clearance, start.y - MAX_RISE))
  const lane = nearestLane(start, bounds, nearest, footprint)
  const corners =
    lane === undefined
      ? runUnder(start, bounds, runY, footprint)
      : [start, {x: start.x, y: runY}, {x: lane, y: runY}, {x: lane, y: climbTop(runY, bounds, footprint)}]
  return roundCorners(distinctPoints(corners)).map((point) => ({x: point.x - start.x, y: point.y - start.y}))
}

const viewportCeiling = (bounds: EmitterBounds): EmitterRect => ({
  top: Number.NEGATIVE_INFINITY,
  left: Number.NEGATIVE_INFINITY,
  right: Number.POSITIVE_INFINITY,
  bottom: bounds.top,
})

function blocksRise(start: EmitterPoint, obstacle: EmitterRect, footprint: EmitterFootprint): boolean {
  const overhead = obstacle.left - footprint.clearance < start.x && start.x < obstacle.right + footprint.clearance
  const withinReach = obstacle.top < start.y && start.y - MAX_RISE - footprint.clearance < obstacle.bottom
  return overhead && withinReach
}

function nearestLane(
  start: EmitterPoint,
  bounds: EmitterBounds,
  obstacle: EmitterRect,
  footprint: EmitterFootprint,
): number | undefined {
  const left = obstacle.left - footprint.clearance
  const right = obstacle.right + footprint.clearance
  const lanes = [
    {x: left, open: left - footprint.reach >= bounds.left},
    {x: right, open: right + footprint.reach <= bounds.right},
  ].filter((lane) => lane.open)
  return lanes.toSorted((first, second) => Math.abs(first.x - start.x) - Math.abs(second.x - start.x))[0]?.x
}

function climbTop(runY: number, bounds: EmitterBounds, footprint: EmitterFootprint): number {
  return Math.min(runY, Math.max(runY - DETOUR_CLIMB, bounds.top + footprint.clearance))
}

function runUnder(
  start: EmitterPoint,
  bounds: EmitterBounds,
  runY: number,
  footprint: EmitterFootprint,
): EmitterPoint[] {
  const run = MAX_RISE * BEND_FACTOR
  const leftEnd = Math.max(start.x - run, bounds.left + footprint.reach)
  const rightEnd = Math.min(start.x + run, bounds.right - footprint.reach)
  const end = rightEnd - start.x >= start.x - leftEnd ? rightEnd : leftEnd
  return [start, {x: start.x, y: runY}, {x: end, y: runY}]
}

function distinctPoints(points: EmitterPoint[]): EmitterPoint[] {
  return points.filter((point, index) => {
    const previous = points[index - 1]
    return previous === undefined || previous.x !== point.x || previous.y !== point.y
  })
}

function roundCorners(points: EmitterPoint[]): EmitterPoint[] {
  return points.flatMap((point, index) => {
    const previous = points[index - 1]
    const next = points[index + 1]
    if (previous === undefined || next === undefined) return [point]
    return cornerArc(previous, point, next)
  })
}

function cornerArc(previous: EmitterPoint, corner: EmitterPoint, next: EmitterPoint): EmitterPoint[] {
  const before = distance(previous, corner)
  const after = distance(corner, next)
  const radius = Math.min(DETOUR_CORNER_RADIUS, before / 2, after / 2)
  const entry = toward(corner, previous, radius / before)
  const exit = toward(corner, next, radius / after)
  return DETOUR_CORNER_PROGRESS.map((progress) => quadraticAt(entry, corner, exit, progress))
}

const distance = (from: EmitterPoint, to: EmitterPoint): number => Math.hypot(to.x - from.x, to.y - from.y)

const toward = (from: EmitterPoint, to: EmitterPoint, fraction: number): EmitterPoint => ({
  x: from.x + (to.x - from.x) * fraction,
  y: from.y + (to.y - from.y) * fraction,
})

function quadraticAt(from: EmitterPoint, control: EmitterPoint, to: EmitterPoint, progress: number): EmitterPoint {
  const rest = 1 - progress
  return {
    x: rest * rest * from.x + 2 * rest * progress * control.x + progress * progress * to.x,
    y: rest * rest * from.y + 2 * rest * progress * control.y + progress * progress * to.y,
  }
}

export function viewportBounds(): EmitterBounds {
  return {top: 0, left: 0, right: document.documentElement.clientWidth}
}

export function stageLocalRect(box: DOMRect, scale: number, rect: EmitterRect): EmitterRect {
  return {
    top: (rect.top - box.top) / scale,
    left: (rect.left - box.left) / scale,
    right: (rect.right - box.left) / scale,
    bottom: (rect.bottom - box.top) / scale,
  }
}

export function stageLocalBounds(box: DOMRect, scale: number, bounds: EmitterBounds): EmitterBounds {
  return {
    top: (bounds.top - box.top) / scale,
    left: (bounds.left - box.left) / scale,
    right: (bounds.right - box.left) / scale,
  }
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

function curveControlPoints(style: BentCurveStyle, room: EmitterRoom, index: number): EmitterPoint[] {
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
