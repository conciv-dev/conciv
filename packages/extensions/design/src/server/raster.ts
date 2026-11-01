import {range} from 'es-toolkit'
import {PNG} from 'pngjs'
import type {Box, Raster} from '../shared/types.js'

const EDGE_THRESHOLD = 48

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

export function scaleToWidth(input: {raster: Raster; width: number}): {raster: Raster; scale: number} {
  const {raster, width} = input
  const scale = width / raster.width
  if (width === raster.width) return {raster, scale}
  const height = Math.max(1, Math.round(raster.height * scale))
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(raster.height - 1, Math.floor(y / scale))
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(raster.width - 1, Math.floor(x / scale))
      const from = (sy * raster.width + sx) * 4
      data.set(raster.data.subarray(from, from + 4), (y * width + x) * 4)
    }
  }
  return {raster: {width, height, data}, scale}
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

export function edgeDensity(edges: Uint8Array): number {
  if (edges.length === 0) return 0
  return edges.reduce((sum, value) => sum + value, 0) / edges.length
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

function hex(channels: number[]): string {
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

export function pixelHex(input: {raster: Raster; index: number}): string {
  return hex([0, 1, 2].map((channel) => input.raster.data[input.index * 4 + channel] ?? 0))
}

const NEIGHBOURS = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({dx, dy})))

export function eroded(input: {mask: Uint8Array; width: number; height: number}): Uint8Array {
  const {mask, width, height} = input
  return mask.map((value, index) => {
    const x = index % width
    const y = (index - x) / width
    if (value !== 1 || x === 0 || y === 0 || x === width - 1 || y === height - 1) return 0
    return NEIGHBOURS.every(({dx, dy}) => mask[index + dy * width + dx] === 1) ? 1 : 0
  })
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

function floodFill(input: {mask: Uint8Array; seen: Uint8Array; width: number; height: number; start: number}): {
  size: number
  box: Box
} {
  const {mask, seen, width, height, start} = input
  const bounds = {size: 0, minX: width, minY: height, maxX: 0, maxY: 0}
  const stack = [start]
  seen[start] = 1
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
      if (next < 0 || mask[next] !== 1 || seen[next] === 1) return
      seen[next] = 1
      stack.push(next)
    })
  }
  return {
    size: bounds.size,
    box: {x: bounds.minX, y: bounds.minY, w: bounds.maxX - bounds.minX + 1, h: bounds.maxY - bounds.minY + 1},
  }
}

export function findRegions(input: {mask: Uint8Array; width: number; height: number; minSize: number}): Box[] {
  const {mask, width, height, minSize} = input
  const seen = new Uint8Array(width * height)
  const regions: Box[] = []
  for (let start = 0; start < width * height; start += 1) {
    if (mask[start] !== 1 || seen[start] === 1) continue
    const region = floodFill({mask, seen, width, height, start})
    if (region.size >= minSize) regions.push(region.box)
  }
  return regions
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
