import {range} from 'es-toolkit'
import {PNG} from 'pngjs'
import {TOLERANCES} from '../shared/tolerances.js'
import type {Box, Raster} from '../shared/types.js'

const EDGE_THRESHOLD = 48
const MINIMUM_TRIM_SIDE = 2
const DIAGONAL_SHARE = 1 - Math.SQRT1_2

export type Rgb = [number, number, number]

export function decodePng(bytes: Uint8Array): Raster {
  const png = PNG.sync.read(Buffer.from(bytes))
  return {width: png.width, height: png.height, data: new Uint8Array(png.data)}
}

export function encodePng(raster: Raster): Uint8Array {
  const png = new PNG({width: raster.width, height: raster.height})
  png.data = Buffer.from(raster.data)
  return new Uint8Array(PNG.sync.write(png))
}

export function crop(input: {raster: Raster; box: Box; margin?: number}): {raster: Raster; box: Box} {
  const {raster, box} = input
  const margin = input.margin ?? 0
  const x0 = Math.min(raster.width, Math.max(0, Math.floor(box.x - margin)))
  const y0 = Math.min(raster.height, Math.max(0, Math.floor(box.y - margin)))
  const x1 = Math.max(x0, Math.min(raster.width, Math.ceil(box.x + box.w + margin)))
  const y1 = Math.max(y0, Math.min(raster.height, Math.ceil(box.y + box.h + margin)))
  const width = x1 - x0
  const height = y1 - y0
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const start = ((y0 + y) * raster.width + x0) * 4
    data.set(raster.data.subarray(start, start + width * 4), y * width * 4)
  }
  return {raster: {width, height, data}, box: {x: x0, y: y0, w: width, h: height}}
}

function blurredChannel(input: {
  raster: Raster
  radius: number
  horizontal: boolean
  x: number
  y: number
  channel: number
}): number {
  const {raster, radius, horizontal, x, y, channel} = input
  const {width, height} = raster
  const sum = Array.from({length: radius * 2 + 1}, (_, index) => index - radius).reduce((total, offset) => {
    const sx = horizontal ? Math.min(width - 1, Math.max(0, x + offset)) : x
    const sy = horizontal ? y : Math.min(height - 1, Math.max(0, y + offset))
    return total + (raster.data[(sy * width + sx) * 4 + channel] ?? 0)
  }, 0)
  return Math.round(sum / (radius * 2 + 1))
}

function blurPass(input: {raster: Raster; radius: number; horizontal: boolean}): Raster {
  const {raster, radius, horizontal} = input
  const {width, height} = raster
  const data = new Uint8Array(raster.data.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        data[(y * width + x) * 4 + channel] = blurredChannel({raster, radius, horizontal, x, y, channel})
      }
    }
  }
  return {width, height, data}
}

export function boxBlur(input: {raster: Raster; radius: number}): Raster {
  if (input.radius <= 0) return input.raster
  const once = blurPass({raster: input.raster, radius: input.radius, horizontal: true})
  return blurPass({raster: once, radius: input.radius, horizontal: false})
}

function luminance(raster: Raster): Float32Array {
  const out = new Float32Array(raster.width * raster.height)
  for (let i = 0; i < out.length; i += 1) {
    const r = raster.data[i * 4] ?? 0
    const g = raster.data[i * 4 + 1] ?? 0
    const b = raster.data[i * 4 + 2] ?? 0
    out[i] = 0.299 * r + 0.587 * g + 0.114 * b
  }
  return out
}

export function edgeMap(raster: Raster): Uint8Array {
  const {width, height} = raster
  const lum = luminance(raster)
  const edges = new Uint8Array(width * height)
  const at = (x: number, y: number): number => lum[y * width + x] ?? 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const gx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)
      const gy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)
      edges[y * width + x] = Math.hypot(gx, gy) > EDGE_THRESHOLD ? 1 : 0
    }
  }
  return edges
}

function channelMedian(histogram: Uint32Array, count: number): number {
  const half = count / 2
  let seen = 0
  for (let value = 0; value < histogram.length; value += 1) {
    seen += histogram[value] ?? 0
    if (seen >= half) return value
  }
  return 0
}

export function hex(channels: number[]): string {
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

export function pixelHex(input: {raster: Raster; index: number}): string {
  return hex([0, 1, 2].map((channel) => input.raster.data[input.index * 4 + channel] ?? 0))
}

export function medianColor(input: {raster: Raster; exclude: Uint8Array}): string {
  const {raster, exclude} = input
  const histograms = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
  let count = 0
  for (let i = 0; i < raster.width * raster.height; i += 1) {
    if (exclude[i] === 1) continue
    count += 1
    histograms.forEach((histogram, c) => {
      const value = raster.data[i * 4 + c] ?? 0
      histogram[value] = (histogram[value] ?? 0) + 1
    })
  }
  return hex(histograms.map((histogram) => channelMedian(histogram, count)))
}

export type Region = {label: number; size: number; box: Box}

function floodFill(input: {
  mask: Uint8Array
  labels: Int32Array
  width: number
  height: number
  start: number
}): Region {
  const {mask, labels, width, height, start} = input
  const label = labels[start] ?? 0
  const bounds = {size: 0, minX: width, minY: height, maxX: 0, maxY: 0}
  const stack = [start]
  while (stack.length > 0) {
    const index = stack.pop() ?? 0
    const x = index % width
    const y = (index - x) / width
    bounds.size += 1
    bounds.minX = Math.min(bounds.minX, x)
    bounds.minY = Math.min(bounds.minY, y)
    bounds.maxX = Math.max(bounds.maxX, x)
    bounds.maxY = Math.max(bounds.maxY, y)
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x < width - 1 ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y < height - 1 ? index + width : -1,
    ]
    neighbours.forEach((next) => {
      if (next < 0 || mask[next] !== 1 || labels[next] !== 0) return
      labels[next] = label
      stack.push(next)
    })
  }
  return {
    label,
    size: bounds.size,
    box: {x: bounds.minX, y: bounds.minY, w: bounds.maxX - bounds.minX + 1, h: bounds.maxY - bounds.minY + 1},
  }
}

export function labelRegions(input: {mask: Uint8Array; width: number; height: number}): {
  labels: Int32Array
  regions: Region[]
} {
  const {mask, width, height} = input
  const labels = new Int32Array(width * height)
  const regions: Region[] = []
  for (let start = 0; start < width * height; start += 1) {
    if (mask[start] !== 1 || labels[start] !== 0) continue
    labels[start] = regions.length + 1
    regions.push(floodFill({mask, labels, width, height, start}))
  }
  return {labels, regions}
}

export function findRegions(input: {mask: Uint8Array; width: number; height: number; minSize: number}): Box[] {
  return labelRegions(input)
    .regions.filter((region) => region.size >= input.minSize)
    .map((region) => region.box)
}

export function diffMask(input: {output: Uint8Array; width: number; height: number}): Uint8Array {
  const {output, width, height} = input
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i += 1) {
    const red = output[i * 4] === 255 && output[i * 4 + 1] === 0 && output[i * 4 + 2] === 0
    mask[i] = red && output[i * 4 + 3] === 255 ? 1 : 0
  }
  return mask
}

export function boxMask(input: {boxes: Box[]; area: Box}): Uint8Array {
  const {boxes, area} = input
  const mask = new Uint8Array(area.w * area.h)
  boxes.forEach((box) => {
    const x0 = Math.max(0, box.x - area.x)
    const x1 = Math.min(area.w, box.x + box.w - area.x)
    if (x1 <= x0) return
    range(Math.max(0, box.y - area.y), Math.min(area.h, box.y + box.h - area.y)).forEach((y) => {
      mask.fill(1, y * area.w + x0, y * area.w + x1)
    })
  })
  return mask
}

export function paintOver(input: {onto: Raster; from: Raster; boxes: Box[]}): Raster {
  const {onto, from, boxes} = input
  const data = new Uint8Array(onto.data)
  const width = Math.min(onto.width, from.width)
  const height = Math.min(onto.height, from.height)
  boxes.forEach((box) => {
    const x0 = Math.max(0, Math.floor(box.x))
    const x1 = Math.min(width, Math.ceil(box.x + box.w))
    if (x1 <= x0) return
    range(Math.max(0, Math.floor(box.y)), Math.min(height, Math.ceil(box.y + box.h))).forEach((y) => {
      data.set(from.data.subarray((y * from.width + x0) * 4, (y * from.width + x1) * 4), (y * onto.width + x0) * 4)
    })
  })
  return {width: onto.width, height: onto.height, data}
}

export function expand(input: {box: Box; by: number}): Box {
  const {box, by} = input
  return {x: box.x - by, y: box.y - by, w: box.w + by * 2, h: box.h + by * 2}
}

function differs(input: {data: Uint8Array; index: number; background: Uint8Array}): boolean {
  const {data, index, background} = input
  return range(4).some(
    (channel) => Math.abs((data[index * 4 + channel] ?? 0) - (background[channel] ?? 0)) > TOLERANCES.inkTrimThreshold,
  )
}

export function trimToInk(input: {raster: Raster; box: Box}): Box {
  const {raster, box} = input
  const x = Math.max(0, Math.floor(box.x))
  const y = Math.max(0, Math.floor(box.y))
  const w = Math.min(raster.width - x, Math.ceil(box.w))
  const h = Math.min(raster.height - y, Math.ceil(box.h))
  if (w < MINIMUM_TRIM_SIDE || h < MINIMUM_TRIM_SIDE) return box
  const tile = crop({raster, box: {x, y, w, h}}).raster
  const background = tile.data.slice(0, 4)
  const ink = range(w * h).filter((index) => differs({data: tile.data, index, background}))
  if (ink.length === 0) return box
  const bounds = ink.reduce(
    (edges, index) => {
      const column = index % w
      const row = (index - column) / w
      return {
        left: Math.min(edges.left, column),
        top: Math.min(edges.top, row),
        right: Math.max(edges.right, column + 1),
        bottom: Math.max(edges.bottom, row + 1),
      }
    },
    {left: w, top: h, right: 0, bottom: 0},
  )
  return {x: x + bounds.left, y: y + bounds.top, w: bounds.right - bounds.left, h: bounds.bottom - bounds.top}
}

export function rgbAt(input: {raster: Raster; index: number}): Rgb {
  const {raster, index} = input
  return [raster.data[index * 4] ?? 0, raster.data[index * 4 + 1] ?? 0, raster.data[index * 4 + 2] ?? 0]
}

export function rgbDistance(input: {a: Rgb; b: Rgb}): number {
  const {a, b} = input
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

export function inkCoverage(input: {raster: Raster; box: Box; background: Rgb; threshold: number}): number {
  const {raster, box, background, threshold} = input
  const area = box.w * box.h
  if (area <= 0) return 0
  let covered = 0
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      if (rgbDistance({a: rgbAt({raster, index: y * raster.width + x}), b: background}) > threshold) covered += 1
    }
  }
  return covered / area
}

function cornerDepth(input: {
  raster: Raster
  corner: {x: number; y: number}
  step: {x: number; y: number}
  inside: Rgb
  outside: Rgb
  limit: number
}): number {
  const {raster, corner, step, inside, outside, limit} = input
  const span = rgbDistance({a: inside, b: outside})
  if (span === 0) return 0
  let depth = 0
  for (let i = 0; i < limit; i += 1) {
    const index = (corner.y + step.y * i) * raster.width + corner.x + step.x * i
    const covered = Math.min(1, rgbDistance({a: rgbAt({raster, index}), b: outside}) / span)
    depth += 1 - covered
    if (covered >= 1) break
  }
  return depth
}

export function cornerRadius(input: {raster: Raster; box: Box; inside: Rgb; outside: Rgb}): number {
  const {raster, box, inside, outside} = input
  const limit = Math.floor(Math.min(box.w, box.h) / 2)
  const right = box.x + box.w - 1
  const bottom = box.y + box.h - 1
  const corners = [
    {corner: {x: box.x, y: box.y}, step: {x: 1, y: 1}},
    {corner: {x: right, y: box.y}, step: {x: -1, y: 1}},
    {corner: {x: box.x, y: bottom}, step: {x: 1, y: -1}},
    {corner: {x: right, y: bottom}, step: {x: -1, y: -1}},
  ]
  const depths = corners
    .map(({corner, step}) => cornerDepth({raster, corner, step, inside, outside, limit}))
    .toSorted((a, b) => a - b)
  const median = ((depths[1] ?? 0) + (depths[2] ?? 0)) / 2
  return Math.round(median / DIAGONAL_SHARE)
}

export function openMask(input: {mask: Uint8Array; width: number; height: number}): Uint8Array {
  const {mask, width, height} = input
  const pass = (source: Uint8Array, keep: (count: number) => boolean): Uint8Array => {
    const out = new Uint8Array(source.length)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let count = 0
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = Math.min(width - 1, Math.max(0, x + dx))
            const ny = Math.min(height - 1, Math.max(0, y + dy))
            count += source[ny * width + nx] ?? 0
          }
        }
        out[y * width + x] = keep(count) ? 1 : 0
      }
    }
    return out
  }
  return pass(
    pass(mask, (count) => count === 9),
    (count) => count > 0,
  )
}

function clampedArea(box: Box): number {
  return Math.max(0, box.w) * Math.max(0, box.h)
}

function sharedLength(input: {start: number; length: number; otherStart: number; otherLength: number}): number {
  const {start, length, otherStart, otherLength} = input
  return Math.max(0, Math.min(start + length, otherStart + otherLength) - Math.max(start, otherStart))
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

export function downscale(input: {raster: Raster; scale: number}): Raster {
  const {raster, scale} = input
  const width = Math.round(raster.width / scale)
  const height = Math.round(raster.height / scale)
  const data = new Uint8Array(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    const x = index % width
    data.set(blockMean({raster, scale, x, y: (index - x) / width}), index * 4)
  }
  return {width, height, data}
}

function blockMean(input: {raster: Raster; scale: number; x: number; y: number}): number[] {
  const {raster, scale, x, y} = input
  const block = Math.max(1, Math.round(scale))
  const sums = [0, 0, 0, 0]
  for (let offset = 0; offset < block * block; offset += 1) {
    const sx = Math.min(raster.width - 1, Math.floor(x * scale) + (offset % block))
    const sy = Math.min(raster.height - 1, Math.floor(y * scale) + Math.floor(offset / block))
    const from = (sy * raster.width + sx) * 4
    sums.forEach((sum, channel) => {
      sums[channel] = sum + (raster.data[from + channel] ?? 0)
    })
  }
  return sums.map((sum) => Math.round(sum / (block * block)))
}

export function maskShare(input: {mask: Uint8Array; width: number; height: number; box: Box}): number {
  const {mask, width, height, box} = input
  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const x1 = Math.min(width, Math.ceil(box.x + box.w))
  const y1 = Math.min(height, Math.ceil(box.y + box.h))
  if (x1 <= x0 || y1 <= y0) return 0
  let count = 0
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) count += mask[y * width + x] === 1 ? 1 : 0
  }
  return count / ((x1 - x0) * (y1 - y0))
}
