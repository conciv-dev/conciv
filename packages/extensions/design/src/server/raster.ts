import {createHash} from 'node:crypto'
import {clamp, mean, range} from 'es-toolkit'
import {PNG} from 'pngjs'
import {ssim} from 'ssim.js'
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

function blurPass(input: {raster: Raster; radius: number; horizontal: boolean}): Raster {
  const {raster, radius, horizontal} = input
  const {width, height} = raster
  const data = new Uint8Array(raster.data.length)
  const line = {
    source: raster.data,
    data,
    radius,
    stride: horizontal ? 4 : width * 4,
    length: horizontal ? width : height,
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const along = horizontal ? x : y
      blurPixel({...line, along, base: (y * width + x) * 4 - along * line.stride})
    }
  }
  return {width, height, data}
}

function blurPixel(input: {
  source: Uint8Array
  data: Uint8Array
  radius: number
  stride: number
  length: number
  along: number
  base: number
}): void {
  const {source, data, radius, stride, length, along, base} = input
  for (let channel = 0; channel < 4; channel += 1) {
    let sum = 0
    for (let offset = -radius; offset <= radius; offset += 1) {
      sum += source[base + Math.min(length - 1, Math.max(0, along + offset)) * stride + channel] ?? 0
    }
    data[base + along * stride + channel] = Math.round(sum / (radius * 2 + 1))
  }
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
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const above = (y - 1) * width + x
      const here = y * width + x
      const below = (y + 1) * width + x
      const topLeft = lum[above - 1] ?? 0
      const topRight = lum[above + 1] ?? 0
      const bottomLeft = lum[below - 1] ?? 0
      const bottomRight = lum[below + 1] ?? 0
      const gx = topRight + 2 * (lum[here + 1] ?? 0) + bottomRight - topLeft - 2 * (lum[here - 1] ?? 0) - bottomLeft
      const gy = bottomLeft + 2 * (lum[below] ?? 0) + bottomRight - topLeft - 2 * (lum[above] ?? 0) - topRight
      edges[here] = Math.hypot(gx, gy) > EDGE_THRESHOLD ? 1 : 0
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

export function medianColor(input: {raster: Raster; exclude: Uint8Array}): string {
  const {raster, exclude} = input
  const red = new Uint32Array(256)
  const green = new Uint32Array(256)
  const blue = new Uint32Array(256)
  let count = 0
  const data = raster.data
  for (let i = 0; i < raster.width * raster.height; i += 1) {
    if (exclude[i] === 1) continue
    count += 1
    counted({histogram: red, value: data[i * 4] ?? 0})
    counted({histogram: green, value: data[i * 4 + 1] ?? 0})
    counted({histogram: blue, value: data[i * 4 + 2] ?? 0})
  }
  return hex([red, green, blue].map((histogram) => channelMedian(histogram, count)))
}

function counted(input: {histogram: Uint32Array; value: number}): void {
  const {histogram, value} = input
  histogram[value] = (histogram[value] ?? 0) + 1
}

export function coreColor(input: {
  raster: Raster
  inside: Uint8Array
  distance: (rgb: number) => number
  spread: number
}): string | null {
  const {raster, inside, distance, spread} = input
  const data = raster.data
  const distances = new Float64Array(inside.length)
  let peak = 0
  for (let i = 0; i < inside.length; i += 1) {
    if (inside[i] !== 1) continue
    const value = distance(((data[i * 4] ?? 0) << 16) | ((data[i * 4 + 1] ?? 0) << 8) | (data[i * 4 + 2] ?? 0))
    distances[i] = value
    peak = Math.max(peak, value)
  }
  if (peak <= spread) return null
  const exclude = new Uint8Array(inside.length)
  for (let i = 0; i < inside.length; i += 1) exclude[i] = (distances[i] ?? 0) >= peak - spread ? 0 : 1
  return medianColor({raster, exclude})
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
  box: Box
  corner: {x: number; y: number}
  step: {x: number; y: number}
  inside: Rgb
  outside: Rgb
  limit: number
}): number {
  const {raster, box, corner, step, inside, outside, limit} = input
  let depth = 0
  for (let i = 0; i < limit; i += 1) {
    const x = corner.x + step.x * i
    const y = corner.y + step.y * i
    const fill = fillAt({raster, box, x, y, inside})
    const span = rgbDistance({a: fill, b: outside})
    if (span === 0) return depth
    const covered = Math.min(1, rgbDistance({a: rgbAt({raster, index: y * raster.width + x}), b: outside}) / span)
    depth += 1 - covered
    if (covered >= 1) break
  }
  return depth
}

function fillAt(input: {raster: Raster; box: Box; x: number; y: number; inside: Rgb}): Rgb {
  const {raster, box, x, y, inside} = input
  const inset = TOLERANCES.interiorInset
  if (box.w <= inset * 2 || box.h <= inset * 2) return inside
  const rows = range(box.y + inset, box.y + box.h - inset)
  const columns = range(box.x + inset, box.x + box.w - inset)
  const at = {
    x: clamp(x, box.x + inset, box.x + box.w - inset - 1),
    y: clamp(y, box.y + inset, box.y + box.h - inset - 1),
  }
  const column = lineMedian({raster, indices: rows.map((row) => row * raster.width + at.x)})
  const row = lineMedian({raster, indices: columns.map((across) => at.y * raster.width + across)})
  const channel = (c: 0 | 1 | 2): number => Math.min(255, Math.max(0, column[c] + row[c] - inside[c]))
  return [channel(0), channel(1), channel(2)]
}

function lineMedian(input: {raster: Raster; indices: number[]}): Rgb {
  const {raster, indices} = input
  const channel = (c: number): number => {
    const sorted = indices.map((index) => raster.data[index * 4 + c] ?? 0).toSorted((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)] ?? 0
  }
  return [channel(0), channel(1), channel(2)]
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
    .map(({corner, step}) => cornerDepth({raster, box, corner, step, inside, outside, limit}))
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

export type ScoredTile = {box: Box; similarity: number}

export function similarityTiles(input: {
  live: Raster
  target: Raster
  mask: Uint8Array
  width: number
  height: number
}): ScoredTile[] {
  const {mask, width, height} = input
  const side = TOLERANCES.similarityTile
  if (width === 0 || height === 0) return []
  const page = {x: 0, y: 0, w: width, h: height}
  const map = ssim(
    imageData(crop({raster: input.live, box: page}).raster),
    imageData(crop({raster: input.target, box: page}).raster),
    {
      ssim: 'bezkrovny',
      windowSize: side,
      downsample: false,
    },
  ).ssim_map
  return map.data.flatMap((value, index) => {
    const column = index % map.width
    const row = (index - column) / map.width
    const box = {
      x: column * side,
      y: row * side,
      w: Math.min(side, width - column * side),
      h: Math.min(side, height - row * side),
    }
    return maskShare({mask, width, height, box}) < 1 ? [{box, similarity: value}] : []
  })
}

export function meanSimilarity(tiles: ScoredTile[]): number {
  return tiles.length === 0 ? 1 : mean(tiles.map((tile) => tile.similarity))
}

function imageData(raster: Raster): {data: Uint8ClampedArray; width: number; height: number} {
  return {
    data: new Uint8ClampedArray(raster.data.buffer, raster.data.byteOffset, raster.data.length),
    width: raster.width,
    height: raster.height,
  }
}

export type Grid = {side: number; columns: number; rows: number; width: number; height: number}

export function tileGrid(input: {width: number; height: number; side: number}): Grid {
  const {width, height, side} = input
  return {side, columns: Math.ceil(width / side), rows: Math.ceil(height / side), width, height}
}

export function tileBox(input: {grid: Grid; index: number}): Box {
  const {grid, index} = input
  const column = index % grid.columns
  const row = (index - column) / grid.columns
  const x = column * grid.side
  const y = row * grid.side
  return {x, y, w: Math.min(grid.side, grid.width - x), h: Math.min(grid.side, grid.height - y)}
}

export function tileHashes(input: {raster: Raster; grid: Grid; margin: number}): string[] {
  const {raster, grid, margin} = input
  return range(grid.columns * grid.rows).map((index) => {
    const box = tileBox({grid, index})
    const x0 = Math.max(0, box.x - margin)
    const x1 = Math.min(grid.width, box.x + box.w + margin)
    const hash = createHash('sha1')
    range(Math.max(0, box.y - margin), Math.min(grid.height, box.y + box.h + margin)).forEach((y) => {
      hash.update(raster.data.subarray((y * raster.width + x0) * 4, (y * raster.width + x1) * 4))
    })
    return hash.digest('base64')
  })
}

export function packMask(input: {mask: Uint8Array; width: number; box: Box}): string {
  const {mask, width, box} = input
  const bits = new Uint8Array(Math.ceil((box.w * box.h) / 8))
  range(box.w * box.h).forEach((cell) => {
    const column = cell % box.w
    const row = (cell - column) / box.w
    if (mask[(box.y + row) * width + box.x + column] !== 1) return
    bits[cell >> 3] = (bits[cell >> 3] ?? 0) | (1 << (cell & 7))
  })
  return Buffer.from(bits).toString('base64')
}

export function unpackMask(input: {packed: string; mask: Uint8Array; width: number; box: Box}): void {
  const {mask, width, box} = input
  const bits = Buffer.from(input.packed, 'base64')
  range(box.w * box.h).forEach((cell) => {
    if (((bits[cell >> 3] ?? 0) & (1 << (cell & 7))) === 0) return
    const column = cell % box.w
    mask[(box.y + (cell - column) / box.w) * width + box.x + column] = 1
  })
}

export function copyMask(input: {from: Uint8Array; fromArea: Box; onto: Uint8Array; width: number; box: Box}): void {
  const {from, fromArea, onto, width, box} = input
  range(box.h).forEach((row) => {
    const start = (box.y + row - fromArea.y) * fromArea.w + box.x - fromArea.x
    onto.set(from.subarray(start, start + box.w), (box.y + row) * width + box.x)
  })
}

export function maskCount(input: {mask: Uint8Array; width: number; box: Box}): number {
  const {mask, width, box} = input
  return range(box.h).reduce((total, row) => {
    const start = (box.y + row) * width + box.x
    return total + mask.subarray(start, start + box.w).reduce((sum, value) => sum + value, 0)
  }, 0)
}

export function cutout(input: {raster: Raster; box: Box}): Raster {
  const {raster, box} = input
  const data = new Uint8Array(box.w * box.h * 4)
  range(box.h).forEach((row) => {
    const y = box.y + row
    if (y < 0 || y >= raster.height) return
    const left = Math.max(0, box.x)
    const right = Math.min(raster.width, box.x + box.w)
    if (right <= left) return
    const start = (y * raster.width + left) * 4
    data.set(raster.data.subarray(start, start + (right - left) * 4), (row * box.w + left - box.x) * 4)
  })
  return {width: box.w, height: box.h, data}
}

export function besides(input: {rasters: Raster[]; gap: number}): Raster {
  const {rasters, gap} = input
  const width = rasters.reduce((sum, raster) => sum + raster.width, 0) + gap * Math.max(0, rasters.length - 1)
  const height = Math.max(0, ...rasters.map((raster) => raster.height))
  const data = new Uint8Array(width * height * 4)
  rasters.reduce((left, raster) => {
    range(raster.height).forEach((row) => {
      const start = row * raster.width * 4
      data.set(raster.data.subarray(start, start + raster.width * 4), (row * width + left) * 4)
    })
    return left + raster.width + gap
  }, 0)
  return {width, height, data}
}
