import {range} from 'es-toolkit'
import type {Box} from './defs.js'
import {designConfig} from './tolerances.js'

export const box = {
  union,
  bounds,
  expand,
  inset,
  clip,
  encloses,
  overlaps,
  area,
  right,
  bottom,
  intersection,
  centre,
  distance,
  readingOrder,
  sameLine,
  holds,
  nearestLine,
  mask,
}

type Point = {x: number; y: number}

function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((entry) => entry.x))
  const y = Math.min(...boxes.map((entry) => entry.y))
  return {
    x,
    y,
    w: Math.max(...boxes.map((entry) => entry.x + entry.w)) - x,
    h: Math.max(...boxes.map((entry) => entry.y + entry.h)) - y,
  }
}

function bounds(boxes: Box[]): Box | null {
  return boxes.length === 0 ? null : union(boxes)
}

function expand(input: {box: Box; by: number}): Box {
  const {box: rect, by} = input
  return {x: rect.x - by, y: rect.y - by, w: rect.w + by * 2, h: rect.h + by * 2}
}

function inset(input: {box: Box; by: number}): Box {
  const {box: rect, by} = input
  return {x: rect.x + by, y: rect.y + by, w: Math.max(0, rect.w - 2 * by), h: Math.max(0, rect.h - 2 * by)}
}

function clip(input: {box: Box; width: number; height: number; margin: number}): Box {
  const {box: rect, width, height, margin} = input
  const x0 = Math.min(width, Math.max(0, Math.floor(rect.x - margin)))
  const y0 = Math.min(height, Math.max(0, Math.floor(rect.y - margin)))
  const w = Math.max(x0, Math.min(width, Math.ceil(rect.x + rect.w + margin))) - x0
  const h = Math.max(y0, Math.min(height, Math.ceil(rect.y + rect.h + margin))) - y0
  return {x: x0, y: y0, w, h}
}

function encloses(input: {outer: Box; inner: Box}): boolean {
  const {outer, inner} = input
  const slack = designConfig.tolerances.geometryPx
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.x + inner.w <= outer.x + outer.w + slack &&
    inner.y + inner.h <= outer.y + outer.h + slack
  )
}

function overlaps(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  const shared =
    sharedLength({start: a.x, length: a.w, otherStart: b.x, otherLength: b.w}) *
    sharedLength({start: a.y, length: a.h, otherStart: b.y, otherLength: b.h})
  return shared > Math.min(area(a), area(b)) / 2
}

function area(rect: Box): number {
  return Math.max(0, rect.w) * Math.max(0, rect.h)
}

function right(rect: Box): number {
  return rect.x + rect.w
}

function bottom(rect: Box): number {
  return rect.y + rect.h
}

function intersection(input: {a: Box; b: Box}): Box | null {
  const {a, b} = input
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const w = Math.min(a.x + a.w, b.x + b.w) - x
  const h = Math.min(a.y + a.h, b.y + b.h) - y
  return w > 0 && h > 0 ? {x, y, w, h} : null
}

function centre(rect: Box): Point {
  return {x: rect.x + rect.w / 2, y: rect.y + rect.h / 2}
}

function distance(input: {a: Point; b: Point}): number {
  return Math.hypot(X_WEIGHT * (input.a.x - input.b.x), input.a.y - input.b.y)
}

function readingOrder(input: {a: Box; b: Box}): number {
  const {a, b} = input
  return sameLine({a, b}) ? a.x - b.x : a.y - b.y
}

function sameLine(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  return sharedLength({start: a.y, length: a.h, otherStart: b.y, otherLength: b.h}) >= Math.min(a.h, b.h) / 2
}

function holds(input: {outer: Box; inner: Box}): boolean {
  const {outer, inner} = input
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

function nearestLine(input: {lines: Box[]; box: Box}): Box | null {
  const target = centre(input.box)
  return input.lines.reduce<Box | null>((best, line) => {
    if (best === null) return line
    return distance({a: centre(line), b: target}) < distance({a: centre(best), b: target}) ? line : best
  }, null)
}

function mask(input: {boxes: Box[]; within: Box}): Uint8Array {
  const {boxes, within} = input
  const cells = new Uint8Array(within.w * within.h)
  boxes.forEach((entry) => {
    const x0 = Math.max(0, entry.x - within.x)
    const x1 = Math.min(within.w, entry.x + entry.w - within.x)
    if (x1 <= x0) return
    range(Math.max(0, entry.y - within.y), Math.min(within.h, entry.y + entry.h - within.y)).forEach((y) => {
      cells.fill(1, y * within.w + x0, y * within.w + x1)
    })
  })
  return cells
}

function sharedLength(input: {start: number; length: number; otherStart: number; otherLength: number}): number {
  const {start, length, otherStart, otherLength} = input
  return Math.max(0, Math.min(start + length, otherStart + otherLength) - Math.max(start, otherStart))
}

const X_WEIGHT = 0.5
