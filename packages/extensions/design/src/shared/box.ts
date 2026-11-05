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

export function overlaps(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  const shared =
    sharedLength({start: a.x, length: a.w, otherStart: b.x, otherLength: b.w}) *
    sharedLength({start: a.y, length: a.h, otherStart: b.y, otherLength: b.h})
  return shared > Math.min(area(a), area(b)) / 2
}

function sharedLength(input: {start: number; length: number; otherStart: number; otherLength: number}): number {
  const {start, length, otherStart, otherLength} = input
  return Math.max(0, Math.min(start + length, otherStart + otherLength) - Math.max(start, otherStart))
}

export function area(box: Box): number {
  return Math.max(0, box.w) * Math.max(0, box.h)
}
