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
