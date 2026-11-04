import {z} from 'zod'
import type {TriggerPosition} from '@conciv/protocol/config-types'

export type TriggerCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type TriggerEdge = 'top' | 'bottom' | 'left' | 'right'
export type TriggerCoords = {x: number; y: number}
export type Bounds = {minX: number; minY: number; maxX: number; maxY: number}
type Size = {width: number; height: number}

const FRICTION = 0.95
const RESTITUTION = 0.5
const MIN_SPEED = 0.1
export const DRAG_THRESHOLD = 4
const DIRECTION_DEADZONE = 8
const DIRECTION_AXIS_RATIO = 0.5
const THROW_FRAME_CAP = 600
const HOT_CORNER_SNAP = 72
export const HOT_CORNER_HOLD_MS = 2000

export function viewportWidth(): number {
  return document.documentElement.clientWidth || window.innerWidth
}

export function viewportHeight(): number {
  return document.documentElement.clientHeight || window.innerHeight
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function nearWall(value: number, min: number, max: number, snap: number): 'start' | 'end' | null {
  if (value - min <= snap) return 'start'
  if (max - value <= snap) return 'end'
  return null
}

export function cornerAt({x, y}: TriggerCoords, bounds: Bounds, snap = HOT_CORNER_SNAP): TriggerCorner | null {
  const vertical = nearWall(y, bounds.minY, bounds.maxY, snap)
  const horizontal = nearWall(x, bounds.minX, bounds.maxX, snap)
  if (!vertical || !horizontal) return null
  return `${vertical === 'start' ? 'top' : 'bottom'}-${horizontal === 'start' ? 'left' : 'right'}`
}

export function cornerCoords(corner: TriggerCorner, bounds: Bounds): TriggerCoords {
  return {
    x: clamp(corner.endsWith('left') ? bounds.minX : bounds.maxX, bounds.minX, bounds.maxX),
    y: clamp(corner.startsWith('top') ? bounds.minY : bounds.maxY, bounds.minY, bounds.maxY),
  }
}

function axisIntent(delta: number, other: number, deadzone: number): boolean {
  return Math.abs(delta) > deadzone && Math.abs(delta) >= Math.abs(other) * DIRECTION_AXIS_RATIO
}

export function directionCorner(
  dx: number,
  dy: number,
  fallback: TriggerCorner | null,
  deadzone = DIRECTION_DEADZONE,
): TriggerCorner | null {
  if (Math.abs(dx) <= deadzone && Math.abs(dy) <= deadzone) return fallback
  const fallbackTop = fallback?.startsWith('top') ?? false
  const fallbackLeft = fallback?.endsWith('left') ?? false
  const top = axisIntent(dy, dx, deadzone) ? dy < 0 : fallbackTop
  const left = axisIntent(dx, dy, deadzone) ? dx < 0 : fallbackLeft
  return `${top ? 'top' : 'bottom'}-${left ? 'left' : 'right'}`
}

export function quadrantCorner({x, y}: TriggerCoords, size: Size, viewport: Size): TriggerCorner {
  const vertical = y + size.height / 2 < viewport.height / 2 ? 'top' : 'bottom'
  const horizontal = x + size.width / 2 < viewport.width / 2 ? 'left' : 'right'
  return `${vertical}-${horizontal}`
}

export function offScreenEdge({x, y}: TriggerCoords, size: Size, viewport: Size): TriggerEdge | null {
  const centerX = x + size.width / 2
  const centerY = y + size.height / 2
  if (centerX <= 0) return 'left'
  if (centerX >= viewport.width) return 'right'
  if (centerY <= 0) return 'top'
  if (centerY >= viewport.height) return 'bottom'
  return null
}

export function stepAxis(pos: number, vel: number, min: number, max: number): {pos: number; vel: number} {
  const next = pos + vel
  if (next <= min) return {pos: min, vel: -vel * FRICTION * RESTITUTION}
  if (next >= max) return {pos: max, vel: -vel * FRICTION * RESTITUTION}
  return {pos: next, vel: vel * FRICTION}
}

export function throwPath(from: TriggerCoords, velocity: TriggerCoords, bounds: Bounds): TriggerCoords[] {
  const path: TriggerCoords[] = []
  let x = {pos: from.x, vel: velocity.x}
  let y = {pos: from.y, vel: velocity.y}
  while (Math.hypot(x.vel, y.vel) > MIN_SPEED && path.length < THROW_FRAME_CAP) {
    x = stepAxis(x.pos, x.vel, bounds.minX, bounds.maxX)
    y = stepAxis(y.pos, y.vel, bounds.minY, bounds.maxY)
    path.push({x: x.pos, y: y.pos})
  }
  return path
}

export function toPercent(pos: number, min: number, max: number): number {
  return max > min ? clamp(((pos - min) / (max - min)) * 100, 0, 100) : 0
}

export function toPixels(percent: number, min: number, max: number): number {
  return min + (Math.max(max, min) - min) * (clamp(percent, 0, 100) / 100)
}

const PRESETS: TriggerPosition[] = [
  'top-left',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-right',
]

const Percent = z.number().min(0).max(100)
const PlacementSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('corner'), corner: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right'])}),
  z.object({kind: z.literal('free'), x: Percent, y: Percent}),
  z.object({kind: z.literal('edge'), edge: z.enum(['top', 'bottom', 'left', 'right']), along: Percent}),
])

export type Placement = z.infer<typeof PlacementSchema>

export function presetPlacement(preset: TriggerPosition): Placement {
  if (preset === 'middle-left') return {kind: 'free', x: 0, y: 50}
  if (preset === 'middle-right') return {kind: 'free', x: 100, y: 50}
  return {kind: 'corner', corner: preset}
}

function jsonOf(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export function parsePlacement(raw: string): Placement | undefined {
  const preset = PRESETS.find((candidate) => candidate === raw)
  if (preset) return presetPlacement(preset)
  const parsed = PlacementSchema.safeParse(jsonOf(raw))
  return parsed.success ? parsed.data : undefined
}
