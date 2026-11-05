import {TOLERANCES} from './tolerances.js'
import type {Box} from './defs.js'

export function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  return {
    x,
    y,
    w: Math.max(...boxes.map((box) => box.x + box.w)) - x,
    h: Math.max(...boxes.map((box) => box.y + box.h)) - y,
  }
}

export function expand(input: {box: Box; by: number}): Box {
  const {box, by} = input
  return {x: box.x - by, y: box.y - by, w: box.w + by * 2, h: box.h + by * 2}
}

export function encloses(input: {outer: Box; inner: Box}): boolean {
  const {outer, inner} = input
  const slack = TOLERANCES.geometryPx
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.x + inner.w <= outer.x + outer.w + slack &&
    inner.y + inner.h <= outer.y + outer.h + slack
  )
}

export function overlapping(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  const shared =
    sharedLength({start: a.x, length: a.w, otherStart: b.x, otherLength: b.w}) *
    sharedLength({start: a.y, length: a.h, otherStart: b.y, otherLength: b.h})
  return shared > Math.min(clampedArea(a), clampedArea(b)) / 2
}

export function sameLine(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  return sharedLength({start: a.y, length: a.h, otherStart: b.y, otherLength: b.h}) >= Math.min(a.h, b.h) / 2
}

export function intersection(input: {a: Box; b: Box}): Box | null {
  const {a, b} = input
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const w = Math.min(a.x + a.w, b.x + b.w) - x
  const h = Math.min(a.y + a.h, b.y + b.h) - y
  return w > 0 && h > 0 ? {x, y, w, h} : null
}

export function readingOrder(a: Box, b: Box): number {
  if (sameLine({a, b})) return a.x - b.x
  return a.y - b.y
}

function sharedLength(input: {start: number; length: number; otherStart: number; otherLength: number}): number {
  const {start, length, otherStart, otherLength} = input
  return Math.max(0, Math.min(start + length, otherStart + otherLength) - Math.max(start, otherStart))
}

function clampedArea(box: Box): number {
  return Math.max(0, box.w) * Math.max(0, box.h)
}

export function centre(box: Box): {x: number; y: number} {
  return {x: box.x + box.w / 2, y: box.y + box.h / 2}
}

export function holds(input: {outer: Box; inner: Box}): boolean {
  const {outer, inner} = input
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

export function nearestLine(input: {lines: Box[]; box: Box}): Box | null {
  const target = centre(input.box)
  return input.lines.reduce<Box | null>((best, line) => {
    if (best === null) return line
    return distance({a: centre(line), b: target}) < distance({a: centre(best), b: target}) ? line : best
  }, null)
}

export function distance(input: {a: {x: number; y: number}; b: {x: number; y: number}}): number {
  return Math.hypot(X_WEIGHT * (input.a.x - input.b.x), input.a.y - input.b.y)
}

const X_WEIGHT = 0.5

export function boundsOf(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  return {x, y, w: Math.max(...boxes.map(rightEdge)) - x, h: Math.max(...boxes.map(bottomEdge)) - y}
}

export function rightEdge(box: Box): number {
  return box.x + box.w
}

export function bottomEdge(box: Box): number {
  return box.y + box.h
}
