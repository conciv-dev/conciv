import {range} from 'es-toolkit'
import type {Box} from './design.js'

export function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((entry) => entry.x))
  const y = Math.min(...boxes.map((entry) => entry.y))
  return {
    x,
    y,
    w: Math.max(...boxes.map((entry) => entry.x + entry.w)) - x,
    h: Math.max(...boxes.map((entry) => entry.y + entry.h)) - y,
  }
}

export function expand(input: {box: Box; by: number}): Box {
  const {box, by} = input
  return {x: box.x - by, y: box.y - by, w: box.w + by * 2, h: box.h + by * 2}
}

export function inset(input: {box: Box; by: number}): Box {
  const {box, by} = input
  return {x: box.x + by, y: box.y + by, w: Math.max(0, box.w - 2 * by), h: Math.max(0, box.h - 2 * by)}
}

export function clip(input: {box: Box; width: number; height: number}): Box {
  const {box, width, height} = input
  const x = Math.min(width, Math.max(0, Math.floor(box.x)))
  const y = Math.min(height, Math.max(0, Math.floor(box.y)))
  const w = Math.max(x, Math.min(width, Math.ceil(box.x + box.w))) - x
  const h = Math.max(y, Math.min(height, Math.ceil(box.y + box.h))) - y
  return {x, y, w, h}
}

export function mask(input: {boxes: Box[]; within: Box}): Uint8Array {
  const {boxes, within} = input
  const cells = new Uint8Array(within.w * within.h)
  boxes.forEach((entry) => {
    const left = Math.max(0, entry.x - within.x)
    const right = Math.min(within.w, entry.x + entry.w - within.x)
    if (right <= left) return
    range(Math.max(0, entry.y - within.y), Math.min(within.h, entry.y + entry.h - within.y)).forEach((row) => {
      cells.fill(1, row * within.w + left, row * within.w + right)
    })
  })
  return cells
}
