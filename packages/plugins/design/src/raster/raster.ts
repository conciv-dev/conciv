import {Effect} from 'effect'
import {range} from 'es-toolkit'
import {PNG} from 'pngjs'
import type {Box} from '../model/design.js'
import {clip} from '../model/box.js'
import {hex} from '../model/color.js'
import {designErrors} from '../errors/errors.js'

export type Pixels = {readonly width: number; readonly height: number; readonly data: Uint8Array}

export type Raster = Pixels & {
  readonly background: (box: Box) => string
  readonly crop: (box: Box) => Raster
  readonly png: () => Uint8Array
}

type Rgb = readonly [number, number, number]

const CHANNELS = 4
const EDGE_THRESHOLD = 48
const SUB_FILTER = 1
const PNG_WRITE = {filterType: SUB_FILTER} as const

export function readPng(input: {bytes: Uint8Array; what: string}) {
  return Effect.try({
    try: () => PNG.sync.read(Buffer.from(input.bytes)),
    catch: (cause) => designErrors.UNREADABLE({file: input.what, detail: String(cause)}),
  }).pipe(Effect.map((decoded) => ({width: decoded.width, height: decoded.height, data: new Uint8Array(decoded.data)})))
}

export function writePng(pixels: Pixels): Uint8Array {
  const encoded = new PNG({width: pixels.width, height: pixels.height, ...PNG_WRITE})
  encoded.data = Buffer.from(pixels.data)
  return new Uint8Array(PNG.sync.write(encoded, PNG_WRITE))
}

export function createRaster(pixels: Pixels): Raster {
  return {
    ...pixels,
    background: (box) => {
      const cut = region({pixels, box})
      return hex(medianRgb({pixels: cut, exclude: edgeMap(cut)}))
    },
    crop: (box) => createRaster(region({pixels, box})),
    png: () => writePng(pixels),
  }
}

function region(input: {pixels: Pixels; box: Box}): Pixels {
  const {pixels} = input
  const {x, y, w, h} = clip({box: input.box, width: pixels.width, height: pixels.height})
  const data = new Uint8Array(w * h * CHANNELS)
  range(h).forEach((row) => {
    const start = ((y + row) * pixels.width + x) * CHANNELS
    data.set(pixels.data.subarray(start, start + w * CHANNELS), row * w * CHANNELS)
  })
  return {width: w, height: h, data}
}

function edgeMap(pixels: Pixels): Uint8Array {
  const {width, height, data} = pixels
  const luminance = Float32Array.from(
    range(width * height),
    (index) =>
      0.299 * (data[index * CHANNELS] ?? 0) +
      0.587 * (data[index * CHANNELS + 1] ?? 0) +
      0.114 * (data[index * CHANNELS + 2] ?? 0),
  )
  const edges = new Uint8Array(width * height)
  const brightness = (index: number): number => luminance[index] ?? 0
  range(1, height - 1).forEach((y) =>
    range(1, width - 1).forEach((x) => {
      const above = (y - 1) * width + x
      const here = y * width + x
      const below = (y + 1) * width + x
      const topLeft = brightness(above - 1)
      const topRight = brightness(above + 1)
      const bottomLeft = brightness(below - 1)
      const bottomRight = brightness(below + 1)
      const horizontal =
        topRight + 2 * brightness(here + 1) + bottomRight - topLeft - 2 * brightness(here - 1) - bottomLeft
      const vertical = bottomLeft + 2 * brightness(below) + bottomRight - topLeft - 2 * brightness(above) - topRight
      edges[here] = Math.hypot(horizontal, vertical) > EDGE_THRESHOLD ? 1 : 0
    }),
  )
  return edges
}

function medianRgb(input: {pixels: Pixels; exclude: Uint8Array}): Rgb {
  const {pixels, exclude} = input
  const histograms = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
  const kept = range(pixels.width * pixels.height).reduce((count, index) => {
    if (exclude[index] === 1) return count
    histograms.forEach((histogram, channel) => {
      const value = pixels.data[index * CHANNELS + channel] ?? 0
      histogram[value] = (histogram[value] ?? 0) + 1
    })
    return count + 1
  }, 0)
  const [red, green, blue] = histograms.map((histogram) => channelMedian({histogram, count: kept}))
  return [red ?? 0, green ?? 0, blue ?? 0]
}

function channelMedian(input: {histogram: Uint32Array; count: number}): number {
  const {histogram, count} = input
  const cumulative = [...histogram].reduce<number[]>((sums, value) => [...sums, (sums.at(-1) ?? 0) + value], [])
  const found = cumulative.findIndex((seen) => seen >= count / 2)
  return found === -1 ? 0 : found
}
