import pixelmatch from 'pixelmatch'
import {diff} from '@blazediff/core'
import {range} from 'es-toolkit'
import {PNG} from 'pngjs'
import type {Storage} from 'unstorage'
import {differenceCiede2000, parse} from 'culori'
import {toolError} from '@conciv/extension'
import {TOLERANCES} from '../shared/tolerances.js'
import type {Box, ColorMetric, PixelComparator, Raster} from '../shared/types.js'

const EDGE_THRESHOLD = 48
const MINIMUM_TRIM_SIDE = 2

export type Rgb = [number, number, number]

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

export function fnv(text: string): string {
  const hash = [...text].reduce(
    (state, character) => Math.imul(state ^ (character.codePointAt(0) ?? 0), FNV_PRIME) >>> 0,
    FNV_OFFSET,
  )
  return hash.toString(16).padStart(ID_LENGTH, '0')
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

export const PIXEL_COMPARATORS = {
  blazediff: {name: 'blazediff', compare: blazediffCompare},
  pixelmatch: {name: 'pixelmatch', compare: pixelmatchCompare},
} as const satisfies Record<string, PixelComparator>

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

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

function edgeMap(raster: Raster): Uint8Array {
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

function counted(input: {histogram: Uint32Array; value: number}): void {
  const {histogram, value} = input
  histogram[value] = (histogram[value] ?? 0) + 1
}

function coreColor(input: {
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

type Region = {label: number; size: number; box: Box}

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

function differs(input: {data: Uint8Array; index: number; background: Uint8Array}): boolean {
  const {data, index, background} = input
  return range(4).some(
    (channel) => Math.abs((data[index * 4 + channel] ?? 0) - (background[channel] ?? 0)) > TOLERANCES.inkTrimThreshold,
  )
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

const FNV_OFFSET = 0x811c9dc5

const FNV_PRIME = 0x01000193

const ID_LENGTH = 8

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

function blazediffCompare(input: {a: Raster; b: Raster}): {mismatch: number; mask: Uint8Array} {
  const {a, b} = input
  const output = new Uint8Array(a.data.length)
  const count = diff(a.data, b.data, output, a.width, a.height, DIFF_OPTIONS)
  return pixelResult({output, count, width: a.width, height: a.height})
}

function pixelmatchCompare(input: {a: Raster; b: Raster}): {mismatch: number; mask: Uint8Array} {
  const {a, b} = input
  const output = new Uint8Array(a.data.length)
  const count = pixelmatch(a.data, b.data, output, a.width, a.height, DIFF_OPTIONS)
  return pixelResult({output, count, width: a.width, height: a.height})
}

const DIFF_OPTIONS = {threshold: 0.1, includeAA: false, diffMask: true} as const

function pixelResult(input: {output: Uint8Array; count: number; width: number; height: number}): {
  mismatch: number
  mask: Uint8Array
} {
  const {output, count, width, height} = input
  const total = width * height
  return {mismatch: total === 0 ? 0 : count / total, mask: diffMask({output, width, height})}
}

function diffMask(input: {output: Uint8Array; width: number; height: number}): Uint8Array {
  const {output, width, height} = input
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i += 1) {
    const red = output[i * 4] === 255 && output[i * 4 + 1] === 0 && output[i * 4 + 2] === 0
    mask[i] = red && output[i * 4 + 3] === 255 ? 1 : 0
  }
  return mask
}
