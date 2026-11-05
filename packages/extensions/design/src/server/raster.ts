import {createHash} from 'node:crypto'
import {clamp, mean, minBy, range} from 'es-toolkit'
import {PNG} from 'pngjs'
import {ssim} from 'ssim.js'
import type {Storage} from 'unstorage'
import {toolError} from '@conciv/extension'
import {leadingFamily, sameFamily, TOLERANCES} from '../shared/tolerances.js'
import type {
  Box,
  ColorMetric,
  Delta,
  DeltaKind,
  Flow,
  Gradient,
  LiveBorder,
  LiveComponent,
  LiveStyles,
  Pair,
  Raster,
  Side,
  TargetNode,
} from '../shared/types.js'
import {differenceCiede2000, parse} from 'culori'
import type {NodeLayout} from '../shared/defs.js'

const EDGE_THRESHOLD = 48
const MINIMUM_TRIM_SIDE = 2
const DIAGONAL_SHARE = 1 - Math.SQRT1_2

export type Rgb = [number, number, number]

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export async function readPng(input: {ref: string; project: Storage}): Promise<Uint8Array<ArrayBuffer>> {
  const raw: unknown = await input.project.getItemRaw(input.ref).catch(() => null)
  if (raw instanceof Uint8Array) return new Uint8Array(raw)
  const bytes = pngBase64(input.ref)
  if (bytes !== null) return bytes
  throw toolError('image-unreadable', {
    message: `image is neither a PNG file nor PNG base64: ${input.ref.slice(0, 80)}`,
  })
}

export function pngBase64(ref: string): Uint8Array<ArrayBuffer> | null {
  const bytes = new Uint8Array(Buffer.from(ref, 'base64'))
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte) ? bytes : null
}

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
  differing: Uint8Array
  width: number
  height: number
}): ScoredTile[] {
  const {mask, width, height} = input
  const side = TOLERANCES.similarityTile
  if (width === 0 || height === 0) return []
  const page = {x: 0, y: 0, w: width, h: height}
  const target = crop({raster: input.target, box: page}).raster
  const map = ssim(
    imageData(seenRaster({live: crop({raster: input.live, box: page}).raster, target, differing: input.differing})),
    imageData(target),
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

function seenRaster(input: {live: Raster; target: Raster; differing: Uint8Array}): Raster {
  const {live, target, differing} = input
  const data = Uint8Array.from(target.data)
  differing.forEach((bit, index) => {
    if (bit === 1) data.set(live.data.subarray(index * 4, index * 4 + 4), index * 4)
  })
  return {width: target.width, height: target.height, data}
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

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
const ID_LENGTH = 8

export function fnv(text: string): string {
  const hash = [...text].reduce(
    (state, character) => Math.imul(state ^ (character.codePointAt(0) ?? 0), FNV_PRIME) >>> 0,
    FNV_OFFSET,
  )
  return hash.toString(16).padStart(ID_LENGTH, '0')
}

const difference = differenceCiede2000()

const ciede2000: ColorMetric = {
  name: 'ciede2000',
  distance: ({a, b}) => {
    const from = parse(a)
    const to = parse(b)
    if (from === undefined || to === undefined) return 0
    return difference(from, to)
  },
}

export const COLOR_METRICS = {ciede2000} as const satisfies Record<string, ColorMetric>

const OPAQUE_HEX_LENGTH = 7

export function isOpaqueHex(color: string): boolean {
  return color.startsWith('#') && color.length === OPAQUE_HEX_LENGTH
}

export function glyphCoreColor(input: {
  raster: Raster
  box: Box
  glyphs: Box[]
  background: string
  color: ColorMetric
}): string | null {
  const {raster, box, glyphs, background, color} = input
  const tile = crop({raster, box})
  const inGlyph = boxMask({boxes: glyphs, area: tile.box})
  const known = new Map<number, number>()
  const distance = (rgb: number): number => {
    const seen = known.get(rgb)
    if (seen !== undefined) return seen
    const measured = color.distance({a: hex([(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff]), b: background})
    known.set(rgb, measured)
    return measured
  }
  return coreColor({raster: tile.raster, inside: inGlyph, distance, spread: TOLERANCES.colorDeltaE})
}

export function sampledFills(input: {raster: Raster; box: Box; glyphs: Box[]; color: ColorMetric}): {
  background: string
  foreground: string | null
} {
  const {raster, box, glyphs, color} = input
  const tile = crop({raster, box}).raster
  const background = medianColor({raster: tile, exclude: edgeMap(tile)})
  return {background, foreground: glyphCoreColor({raster, box, glyphs, background, color})}
}

function colorKind(input: {kind: 'background' | 'foreground'; tolerance: number}): DeltaKind {
  const {kind, tolerance} = input
  const key = kind === 'background' ? 'background' : 'color'
  return {
    kind,
    measure: ({live, target, color}) => {
      const a = live.styles[key]
      const b = target.styles[key]
      if (a === undefined || b === undefined || color.distance({a, b}) <= tolerance) return []
      return [{kind, live: a, target: b}]
    },
  }
}

const solidBackground = colorKind({kind: 'background', tolerance: TOLERANCES.declaredColorDeltaE})

const background: DeltaKind = {
  kind: 'background',
  measure: (input) => {
    const {live, target, color} = input
    const design = target.styles.gradient
    const shown = live.styles.gradient
    if (design !== null && design !== undefined) return gradientDeltas({design, live, color})
    if (shown === null || shown === undefined || live.styles.background !== undefined) {
      return solidBackground.measure(input)
    }
    return solidBackground.measure({...input, live: {...live, styles: {...live.styles, background: shown.from}}})
  },
}

function gradientDeltas(input: {design: Gradient; live: Side; color: ColorMetric}): Delta[] {
  const {design, live, color} = input
  const target = `gradient ${design.from} to ${design.to}`
  const shown = live.styles.gradient
  if (shown === null || shown === undefined) {
    const solid = live.styles.background
    return solid === undefined ? [] : [{kind: 'background', live: solid, target}]
  }
  const ends = [
    {a: shown.from, b: design.from},
    {a: shown.to, b: design.to},
  ]
  if (ends.every((end) => color.distance(end) <= TOLERANCES.colorDeltaE)) return []
  return [{kind: 'background', live: `gradient ${shown.from} to ${shown.to}`, target}]
}
const foreground = colorKind({kind: 'foreground', tolerance: TOLERANCES.colorDeltaE})

type Insets = {left: number; right: number; top: number; bottom: number}

function measureInsets(side: Side): Insets | null {
  const {box, textBox, padding} = side
  if (padding !== null) return padding
  if (textBox === null) return null
  return {
    left: Math.round(textBox.x - box.x),
    right: Math.round(box.x + box.w - (textBox.x + textBox.w)),
    top: Math.round(textBox.y - box.y),
    bottom: Math.round(box.y + box.h - (textBox.y + textBox.h)),
  }
}

function insetDiffers(input: {live: number; target: number}): boolean {
  return Math.abs(input.live - input.target) > TOLERANCES.geometryPx
}

function insetKind(edge: keyof Insets): DeltaKind {
  const kind = `inset-${edge}` as const
  const read = (side: Side): number | null => measureInsets(side)?.[edge] ?? null
  return {
    kind,
    read,
    measure: ({live, target}) => {
      const a = read(live)
      const b = read(target)
      if (a === null || b === null || !insetDiffers({live: a, target: b})) return []
      return [{kind, live: a, target: b}]
    },
  }
}

function rightEdge(box: Box): number {
  return box.x + box.w
}

function bottomEdge(box: Box): number {
  return box.y + box.h
}

const insetLeft = insetKind('left')
const insetRight = insetKind('right')
const insetTop = insetKind('top')
const insetBottom = insetKind('bottom')

function gapBetween(input: {first: Box; second: Box; axis: 'row' | 'column'}): number {
  const {first, second, axis} = input
  return Math.round(axis === 'row' ? second.x - rightEdge(first) : second.y - bottomEdge(first))
}

function measureGap(input: {side: Side; before: boolean}): number | null {
  const {side, before} = input
  if (side.axis === null) return null
  const other = before ? side.prev : side.next
  if (other === null) return null
  if (before) return gapBetween({first: other, second: side.box, axis: side.axis})
  return gapBetween({first: side.box, second: other, axis: side.axis})
}

function gapKind(before: boolean): DeltaKind {
  const kind = before ? 'gap-before' : 'gap-after'
  const read = (side: Side): number | null => measureGap({side, before})
  return {
    kind,
    read,
    measure: ({live, target}) => {
      const a = read(live)
      const b = read(target)
      if (a === null || b === null || !insetDiffers({live: a, target: b})) return []
      return [{kind, live: a, target: b}]
    },
  }
}

const gapBefore = gapKind(true)
const gapAfter: DeltaKind = {...gapKind(false), measure: () => []}

function classifyAlign(side: Side): string | null {
  const insets = measureInsets(side)
  if (insets === null) return null
  const near = (value: number): boolean => Math.abs(value) <= TOLERANCES.geometryPx
  if (near(insets.left) && near(insets.right)) return 'stretch'
  if (near(insets.left - insets.right)) return 'center'
  if (near(insets.left)) return 'left'
  if (near(insets.right)) return 'right'
  return null
}

const align: DeltaKind = {
  kind: 'align',
  read: classifyAlign,
  measure: ({live, target}) => {
    const a = classifyAlign(live)
    const b = classifyAlign(target)
    if (a === null || b === null || a === b) return []
    return [{kind: 'align', live: a, target: b}]
  },
}

function measurePadding(side: Side): {x: number; y: number} | null {
  if (side.styles.fontSize === undefined) return null
  const insets = measureInsets(side)
  if (insets === null) return null
  return {x: Math.round((insets.left + insets.right) / 2), y: Math.round((insets.top + insets.bottom) / 2)}
}

const padding: DeltaKind = {
  kind: 'padding',
  measure: ({live, target}) => {
    const a = measurePadding(live)
    const b = measurePadding(target)
    if (a === null || b === null) return []
    return (['x', 'y'] as const).flatMap((side) =>
      insetDiffers({live: a[side], target: b[side]})
        ? [{kind: 'padding' as const, side, live: a[side], target: b[side]}]
        : [],
    )
  },
}

function sizeKind(input: {kind: 'width' | 'height'; key: 'w' | 'h'}): DeltaKind {
  const {kind, key} = input
  const read = (side: Side): number => Math.round(side.box[key])
  return {
    kind,
    read,
    measure: ({live, target}) => {
      if (target.kind === 'text' && (key === 'h' || !overflowsParent(live))) return []
      const a = target.kind === 'text' ? Math.round(extent(live)[key]) : read(live)
      const b = read(target)
      if (!insetDiffers({live: a, target: b})) return []
      return [{kind, live: a, target: b}]
    },
  }
}

function overflowsParent(side: Side): boolean {
  const {parent} = side
  if (parent === null) return false
  const box = extent(side)
  return parent.x - box.x > TOLERANCES.geometryPx || rightEdge(box) - rightEdge(parent) > TOLERANCES.geometryPx
}

const boxWidth = sizeKind({kind: 'width', key: 'w'})
const boxHeight = sizeKind({kind: 'height', key: 'h'})

const lines: DeltaKind = {
  kind: 'lines',
  measure: ({live, target}) => {
    if (target.kind !== 'text' || live.lines === null || target.lines === null || live.lines === target.lines) return []
    const spacing = target.styles.lineHeight ?? live.styles.lineHeight
    return [
      {kind: 'lines', live: live.lines, target: target.lines, ...(spacing === undefined ? {} : {lineHeight: spacing})},
    ]
  },
}

const radius: DeltaKind = {
  kind: 'radius',
  measure: ({live, target}) => {
    const a = live.radius
    const b = target.radius
    if (a === null || b === null || !insetDiffers({live: a, target: b})) return []
    return [{kind: 'radius', live: a, target: b}]
  },
}

const border: DeltaKind = {
  kind: 'border',
  measure: ({live, target, color}) => {
    const declared = live.styles.border
    if (declared === undefined || live.edge === null || target.edge === null) return []
    if (color.distance({a: live.edge, b: target.edge}) <= TOLERANCES.colorDeltaE) return []
    return [{kind: 'border', side: declared.side, live: declared.color, target: target.edge}]
  },
}

const axis: DeltaKind = {
  kind: 'axis',
  measure: ({live, target}) => {
    if (live.flow === null || target.flow === null || live.flow === target.flow) return []
    return [{kind: 'axis', live: live.flow, target: target.flow}]
  },
}

const sizing: DeltaKind = {
  kind: 'sizing',
  measure: ({live, target}) => {
    if (live.size !== 'fixed' || (target.size !== 'fill' && target.size !== 'fit')) return []
    return [{kind: 'sizing', live: 'fixed', target: target.size}]
  },
}

const columns: DeltaKind = {
  kind: 'columns',
  measure: ({live, target}) => {
    if (live.columns === null || target.columns === null || live.columns === target.columns) return []
    return [{kind: 'columns', live: live.columns, target: target.columns}]
  },
}

const SIZE_TOLERANCE = 0.5

function typographyKind(input: {kind: 'fontSize' | 'lineHeight' | 'fontWeight'; tolerance: number}): DeltaKind {
  const {kind, tolerance} = input
  const key: keyof LiveStyles = kind
  return {
    kind,
    measure: ({live, target}) => {
      const a = live.styles[key]
      const b = target.styles[key]
      if (typeof a !== 'number' || typeof b !== 'number' || Math.abs(a - b) <= tolerance) return []
      return [{kind, live: a, target: b}]
    },
  }
}

const fontSize = typographyKind({kind: 'fontSize', tolerance: SIZE_TOLERANCE})
const lineHeight = typographyKind({kind: 'lineHeight', tolerance: SIZE_TOLERANCE})
const fontWeight = typographyKind({kind: 'fontWeight', tolerance: 0})

const font: DeltaKind = {
  kind: 'font',
  measure: ({live, target}) => {
    const a = live.styles.fontFamily
    const b = target.styles.fontFamily
    if (a === undefined || b === undefined || sameFamily({a, b})) return []
    return [{kind: 'font', live: leadingFamily(a), target: leadingFamily(b)}]
  },
}

export const DELTA_KINDS: DeltaKind[] = [
  insetLeft,
  insetRight,
  insetTop,
  insetBottom,
  boxWidth,
  boxHeight,
  lines,
  gapBefore,
  gapAfter,
  align,
  padding,
  fontSize,
  lineHeight,
  fontWeight,
  font,
  background,
  foreground,
  radius,
  border,
  axis,
  columns,
  sizing,
]

type From = 'live' | 'target'

export function sideFrom(input: {
  pair: Pair
  from: From
  children: Pair[]
  page: Box
  raster: Raster
  color: ColorMetric
  glyphs: Box[]
  strip: Box | null
  nodes: TargetNode[]
}): Side {
  const {pair, from, children, page, raster, color, glyphs, strip, nodes} = input
  const box = pickBox({pair, from})
  return {
    kind: pair.node.kind,
    box,
    parent: pair.parent === null ? page : pickBox({pair: pair.parent, from}),
    prev: pair.prev === null ? null : pickBox({pair: pair.prev, from}),
    next: pair.next === null ? null : pickBox({pair: pair.next, from}),
    axis: pair.live.axis,
    flow: directionOn({pair, from, nodes}),
    columns: columnCount({pair, from, nodes}),
    textBox: contentBox({children, from}),
    ink: inkOn({from, glyphs}),
    lines: lineCount({pair, from}),
    edge: edgeOn({pair, from, raster, strip}),
    radius: radiusOn({pair, from}),
    padding: from === 'target' ? (pair.node.layout?.padding ?? null) : null,
    size: sizeOn({pair, from}),
    styles: sideStyles({pair, from, box, raster, color, glyphs}),
  }
}

export function opinionSide(input: {side: Side; pair: Pair; children: Pair[]}): Side | null {
  const {side, pair, children} = input
  const box = pair.live.opinion?.box
  if (box === undefined) return null
  const boxes = children.map((child) => child.live.opinion?.box)
  const known = boxes.filter((child) => child !== undefined)
  return {
    ...side,
    box,
    prev: opinionBox(pair.prev),
    next: opinionBox(pair.next),
    textBox: known.length === boxes.length ? boundsOf(known) : null,
  }
}

export function edgeStrip(input: {
  pair: Pair
  raster: Raster
  color: ColorMetric
  shift: {dx: number; dy: number}
  toward: 'declared' | 'contrast'
}): Box | null {
  const {pair, raster, color, shift, toward} = input
  const declared = pair.live.styles.border
  if (declared.width <= 0 || declared.style === 'none' || declared.style === 'hidden') return null
  const box = {...pair.liveBox, x: pair.liveBox.x + shift.dx, y: pair.liveBox.y + shift.dy}
  const strips = EDGE_OFFSETS.flatMap(
    (offset) => stripAt({box, side: declared.side, width: declared.width, offset}) ?? [],
  )
  const inside = sampledFills({raster, box, glyphs: [box], color}).background
  const scored = strips.map((strip) => {
    const seen = medianColor({raster: crop({raster, box: strip}).raster, exclude: new Uint8Array(strip.w * strip.h)})
    const score =
      toward === 'declared' ? -color.distance({a: seen, b: declared.color}) : color.distance({a: seen, b: inside})
    return {strip, score}
  })
  const best = scored.reduce<{strip: Box; score: number} | null>(
    (found, entry) => (found === null || entry.score > found.score ? entry : found),
    null,
  )
  return best?.strip ?? null
}

const EDGE_OFFSETS = [-1, 0, 1]
const CORNER_INSET = 2
const FLOW_BAND = 1
const OUT_OF_FLOW = ['absolute', 'fixed']

function stripAt(input: {box: Box; side: LiveBorder['side']; width: number; offset: number}): Box | null {
  const {box, side, offset} = input
  const width = Math.max(1, Math.round(input.width))
  const inset = Math.max(CORNER_INSET, width)
  if (box.w <= inset * 2 || box.h <= inset * 2) return null
  switch (side) {
    case 'top':
      return {x: box.x + inset, y: box.y - offset, w: box.w - inset * 2, h: width}
    case 'bottom':
      return {x: box.x + inset, y: box.y + box.h - width + offset, w: box.w - inset * 2, h: width}
    case 'left':
      return {x: box.x - offset, y: box.y + inset, w: width, h: box.h - inset * 2}
    case 'right':
      return {x: box.x + box.w - width + offset, y: box.y + inset, w: width, h: box.h - inset * 2}
  }
}

function edgeOn(input: {pair: Pair; from: From; raster: Raster; strip: Box | null}): string | null {
  const {pair, from, raster, strip} = input
  if (strip === null) return null
  const {node} = pair
  if (from === 'target' && node.kind === 'box' && node.border !== null) return node.border.color
  return medianColor({raster: crop({raster, box: strip}).raster, exclude: new Uint8Array(strip.w * strip.h)})
}

function radiusOn(input: {pair: Pair; from: From}): number | null {
  const {pair, from} = input
  if (pair.node.kind !== 'box') return null
  return from === 'target' ? pair.node.radius : pair.live.styles.radius
}

function sizeOn(input: {pair: Pair; from: From}): Side['size'] {
  const {pair, from} = input
  if (from === 'target') return pair.node.layout?.size ?? null
  return pair.live.styles.sizing.width === 'fixed' ? 'fixed' : null
}

function lineCount(input: {pair: Pair; from: From}): number | null {
  const {pair, from} = input
  const {node} = pair
  if (node.kind !== 'text') return null
  if (from === 'live') return bandCount(pair.live.glyphs.flatMap((glyph) => glyph.boxes))
  if (node.lines.length > 0) return bandCount(node.lines.map((line) => line.box))
  const spacing = node.typography?.lineHeight ?? 0
  if (spacing <= 0) return null
  return Math.max(1, Math.round(node.box.h / spacing))
}

function bandCount(boxes: Box[]): number | null {
  const bands = boxes
    .toSorted((a, b) => a.y - b.y)
    .reduce<{end: number; count: number}>(
      (state, box) =>
        box.y + box.h / 2 >= state.end
          ? {end: bottomEdge(box), count: state.count + 1}
          : {end: Math.max(state.end, bottomEdge(box)), count: state.count},
      {end: Number.NEGATIVE_INFINITY, count: 0},
    )
  return bands.count === 0 ? null : bands.count
}

function opinionBox(pair: Pair | null): Box | null {
  return pair?.live.opinion?.box ?? null
}

function pickBox(input: {pair: Pair; from: From}): Box {
  return input.from === 'live' ? input.pair.liveBox : input.pair.targetBox
}

function directionOn(input: {pair: Pair; from: From; nodes: TargetNode[]}): Flow | null {
  const {pair, from, nodes} = input
  if (from === 'live') {
    const [first, second] = pair.live.children.filter(laysOut)
    if (first === undefined || second === undefined) return null
    return first.axis ?? 'column'
  }
  const layout = pair.node.layout
  if (layout?.direction === undefined) return null
  const children = nodes.filter((node) => node.within === pair.node.id)
  if (children.length < 2) return null
  if (laidOutChildren({pair, nodes}).length < children.length) return null
  if (pair.live.columns !== null && bothAxes(layout)) return null
  if (layout.direction === 'stack') return 'column'
  if (layout.direction === 'grid') return 'row'
  return layout.direction
}

function laidOutChildren(input: {pair: Pair; nodes: TargetNode[]}): TargetNode[] {
  return unoverlapped(input.nodes.filter((node) => node.within === input.pair.node.id))
}

function unoverlapped<Entry extends {box: Box}>(entries: Entry[]): Entry[] {
  return entries.filter(
    (entry) => !entries.some((other) => other !== entry && boxesOverlap({a: entry.box, b: other.box})),
  )
}

function boxesOverlap(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  const across = Math.min(rightEdge(a), rightEdge(b)) - Math.max(a.x, b.x)
  const down = Math.min(bottomEdge(a), bottomEdge(b)) - Math.max(a.y, b.y)
  return across > TOLERANCES.geometryPx && down > TOLERANCES.geometryPx
}

function laysOut(component: LiveComponent): boolean {
  return !OUT_OF_FLOW.includes(component.styles.position)
}

function bothAxes(layout: NodeLayout): boolean {
  return layout.direction === 'grid' || layout.wrap === true || (layout.runs ?? []).length > 0
}

function columnCount(input: {pair: Pair; from: From; nodes: TargetNode[]}): number | null {
  const {pair, from, nodes} = input
  if (pair.live.columns === null) return null
  if (from === 'live') {
    const row = unoverlapped(firstRow(flowItems(pair.live)))
    if (row.length < 2) return null
    return countedBands(row.map((item) => item.box))
  }
  const kept = laidOutChildren({pair, nodes})
  if (kept.length < 2) return null
  return countedBands(
    firstRow(kept)
      .flatMap((node) => leavesUnder({node, nodes}))
      .map((node) => node.box),
  )
}

function countedBands(boxes: Box[]): number | null {
  const bands = boxes
    .toSorted((a, b) => a.x - b.x)
    .reduce<{end: number; count: number}>(
      (state, box) =>
        box.x >= state.end - FLOW_BAND
          ? {end: box.x + box.w, count: state.count + 1}
          : {end: Math.max(state.end, box.x + box.w), count: state.count},
      {end: Number.NEGATIVE_INFINITY, count: 0},
    )
  return bands.count === 0 ? null : bands.count
}

function flowItems(component: LiveComponent): LiveComponent[] {
  return component.children
    .filter(laysOut)
    .flatMap((child) => (child.box.w === 0 && child.box.h === 0 ? flowItems(child) : [child]))
}

function firstRow<Entry extends {box: Box}>(entries: Entry[]): Entry[] {
  const top = minBy(entries, (entry) => entry.box.y)
  if (top === undefined) return []
  const slack = TOLERANCES.geometryPx
  return entries.filter(({box}) => box.y < bottomEdge(top.box) - slack && bottomEdge(box) > top.box.y + slack)
}

function leavesUnder(input: {node: TargetNode; nodes: TargetNode[]}): TargetNode[] {
  const {node, nodes} = input
  const children = nodes.filter((child) => child.within === node.id)
  if (children.length === 0) return [node]
  return children.flatMap((child) => leavesUnder({node: child, nodes}))
}

function boundsOf(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  return {x, y, w: Math.max(...boxes.map(rightEdge)) - x, h: Math.max(...boxes.map(bottomEdge)) - y}
}

function inkOn(input: {from: From; glyphs: Box[]}): Box | null {
  const ink = input.from === 'live' ? boundsOf(input.glyphs) : null
  if (ink === null) return null
  const halo = TOLERANCES.glyphHalo
  return {x: ink.x + halo, y: ink.y + halo, w: ink.w - halo * 2, h: ink.h - halo * 2}
}

function extent(side: Side): Box {
  return side.ink === null ? side.box : (boundsOf([side.box, side.ink]) ?? side.box)
}

function contentBox(input: {children: Pair[]; from: From}): Box | null {
  const {children, from} = input
  return boundsOf(children.map((pair) => pickBox({pair, from})))
}

function sideStyles(input: {
  pair: Pair
  from: From
  box: Box
  raster: Raster
  color: ColorMetric
  glyphs: Box[]
}): Partial<LiveStyles> {
  const {pair, from, box, raster} = input
  const paintsText = pair.live.glyphs.length > 0
  const glyphs = input.glyphs.length === 0 ? [box] : input.glyphs
  const fills = sampledFills({raster, box, glyphs, color: input.color})
  const color = paintsText && fills.foreground !== null ? {color: fills.foreground} : {}
  if (from === 'target') {
    return {...designPaint({pair, sampled: fills.background}), ...color, ...estimatedType(pair)}
  }
  const {background: declared, color: _declared, ...rest} = pair.live.styles
  return {...rest, ...(isOpaqueHex(declared) ? {background: declared} : {}), ...color}
}

function designPaint(input: {pair: Pair; sampled: string}): Partial<LiveStyles> {
  const {node} = input.pair
  if (node.kind !== 'box' || node.paint === undefined) return {background: input.sampled}
  const {gradient} = node.paint
  return gradient === undefined ? {background: node.paint.background} : {background: node.paint.background, gradient}
}

function estimatedType(pair: Pair): Partial<LiveStyles> {
  const typography = pair.texts.find((text) => text.typography !== undefined)?.typography
  if (typography === undefined) return {}
  const family = typography.family === null ? {} : {fontFamily: typography.family}
  return {fontSize: typography.size, lineHeight: typography.lineHeight, fontWeight: typography.weight, ...family}
}
