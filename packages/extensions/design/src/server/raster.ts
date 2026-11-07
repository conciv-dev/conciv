import {diff} from '@blazediff/core'
import {clamp, range} from 'es-toolkit'
import pixelmatch from 'pixelmatch'
import {PNG} from 'pngjs'
import type {Box, Raster} from '../shared/defs.js'
import {box as boxes} from '../shared/box.js'
import {designConfig} from '../shared/tolerances.js'

export function createRaster(source: Uint8Array | {pixels: Uint8Array; width: number; height: number}): Raster {
  if (!(source instanceof Uint8Array))
    return rasterOf({width: source.width, height: source.height, data: source.pixels})
  const decoded = PNG.sync.read(Buffer.from(source))
  return rasterOf({width: decoded.width, height: decoded.height, data: new Uint8Array(decoded.data)})
}

type Rgb = ReturnType<Raster['rgb']>

type Pixels = {width: number; height: number; data: Uint8Array}

const TOLERANCES = designConfig.tolerances

function rasterOf(pixels: Pixels): Raster {
  const {width, height, data} = pixels
  const raster: Raster = {
    width,
    height,
    crop: (input) => region(input).raster,
    scaled,
    rgb,
    fills,
    median,
    png,
    pixels: () => data,
    trim,
    edges: () => edgeMap(pixels),
    blur: (radius) => rasterOf(boxBlur({pixels, radius})),
    compare,
    paintDiff,
  }
  return raster

  function png(): Uint8Array {
    const encoded = new PNG({width, height})
    encoded.data = Buffer.from(data)
    return new Uint8Array(PNG.sync.write(encoded))
  }

  function region(input: {box: Box; margin?: number}): {raster: Raster; box: Box} {
    const {x: x0, y: y0, w, h} = boxes.clip({box: input.box, width, height, margin: input.margin ?? 0})
    const cut = new Uint8Array(w * h * 4)
    range(h).forEach((y) => {
      const start = ((y0 + y) * width + x0) * 4
      cut.set(data.subarray(start, start + w * 4), y * w * 4)
    })
    return {raster: rasterOf({width: w, height: h, data: cut}), box: {x: x0, y: y0, w, h}}
  }

  function scaled(scale: number): Raster {
    const w = Math.round(width / scale)
    const h = Math.round(height / scale)
    const block = Math.max(1, Math.round(scale))
    const out = new Uint8Array(w * h * 4)
    range(w * h).forEach((index) => {
      const x = index % w
      const y = (index - x) / w
      const sums = [0, 0, 0, 0]
      range(block * block).forEach((offset) => {
        const sx = Math.min(width - 1, Math.floor(x * scale) + (offset % block))
        const sy = Math.min(height - 1, Math.floor(y * scale) + Math.floor(offset / block))
        sums.forEach((sum, channel) => {
          sums[channel] = sum + (data[(sy * width + sx) * 4 + channel] ?? 0)
        })
      })
      out.set(
        sums.map((sum) => Math.round(sum / (block * block))),
        index * 4,
      )
    })
    return rasterOf({width: w, height: h, data: out})
  }

  function rgb(index: number): Rgb {
    return [data[index * 4] ?? 0, data[index * 4 + 1] ?? 0, data[index * 4 + 2] ?? 0]
  }

  function trim(box: Box): Box {
    const inked = inkCells(box)
    if (inked === null || inked.cells.length === 0) return box
    const {x, y, w, h} = inked.area
    const edges = inked.cells.reduce(
      (found, index) => ({
        left: Math.min(found.left, index % w),
        top: Math.min(found.top, Math.floor(index / w)),
        right: Math.max(found.right, (index % w) + 1),
        bottom: Math.max(found.bottom, Math.floor(index / w) + 1),
      }),
      {left: w, top: h, right: 0, bottom: 0},
    )
    return {x: x + edges.left, y: y + edges.top, w: edges.right - edges.left, h: edges.bottom - edges.top}
  }

  function inkCells(box: Box): {area: Box; size: number; cells: number[]} | null {
    const x = Math.max(0, Math.floor(box.x))
    const y = Math.max(0, Math.floor(box.y))
    const w = Math.min(width - x, Math.ceil(box.w))
    const h = Math.min(height - y, Math.ceil(box.h))
    if (w < MINIMUM_TRIM_SIDE || h < MINIMUM_TRIM_SIDE) return null
    const tile = region({box: {x, y, w, h}}).raster.pixels()
    const background = tile.slice(0, 4)
    const cells = range(w * h).filter((index) =>
      range(4).some(
        (channel) =>
          Math.abs((tile[index * 4 + channel] ?? 0) - (background[channel] ?? 0)) > TOLERANCES.inkTrimThreshold,
      ),
    )
    return {area: {x, y, w, h}, size: w * h, cells}
  }

  function fills(input: {box: Box; glyphs: Box[]; color: string}): string[] {
    const tile = region({box: input.box})
    const cut = pixelsOf(tile.raster)
    const background = designConfig.hex(medianRgb({pixels: cut, exclude: edgeMap(cut)}))
    const foreground = glyphCore({tile, glyphs: input.glyphs, background, color: designConfig.colorMetrics.ciede2000})
    return foreground === null ? [background] : [background, foreground]
  }

  function median(exclude: Box[]): Rgb {
    return medianRgb({pixels, exclude: boxes.mask({boxes: exclude, within: {x: 0, y: 0, w: width, h: height}})})
  }

  function compare(input: {other: Raster; comparator: string}): {mismatch: number; mask: Uint8Array} {
    const output = new Uint8Array(data.length)
    const compareWith = input.comparator === 'pixelmatch' ? pixelmatch : diff
    const count = compareWith(data, input.other.pixels(), output, width, height, DIFF_OPTIONS)
    const total = width * height
    return {mismatch: total === 0 ? 0 : count / total, mask: diffMask({output, width, height})}
  }

  function paintDiff(input: {mask: Uint8Array; width: number}): Raster {
    const out = new Uint8Array(data)
    input.mask.forEach((value, index) => {
      if (value !== 1) return
      const x = index % input.width
      const y = (index - x) / input.width
      out.set(DIFF_RED, (y * width + x) * 4)
    })
    return rasterOf({width, height, data: out})
  }
}

function edgeMap(pixels: Pixels): Uint8Array {
  const {width, height, data} = pixels
  const lum = Float32Array.from(
    range(width * height),
    (i) => 0.299 * (data[i * 4] ?? 0) + 0.587 * (data[i * 4 + 1] ?? 0) + 0.114 * (data[i * 4 + 2] ?? 0),
  )
  const edges = new Uint8Array(width * height)
  range(1, height - 1).forEach((y) =>
    range(1, width - 1).forEach((x) => {
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
    }),
  )
  return edges
}

function medianRgb(input: {pixels: Pixels; exclude: Uint8Array}): Rgb {
  const {pixels, exclude} = input
  const histograms = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
  const kept = range(pixels.width * pixels.height).filter((index) => exclude[index] !== 1)
  kept.forEach((index) =>
    histograms.forEach((histogram, channel) => {
      const value = pixels.data[index * 4 + channel] ?? 0
      histogram[value] = (histogram[value] ?? 0) + 1
    }),
  )
  const [red, green, blue] = histograms.map((histogram) => channelMedian({histogram, count: kept.length}))
  return [red ?? 0, green ?? 0, blue ?? 0]
}

function channelMedian(input: {histogram: Uint32Array; count: number}): number {
  const {histogram, count} = input
  const cumulative = [...histogram].reduce<number[]>((sums, value) => [...sums, (sums.at(-1) ?? 0) + value], [])
  const found = cumulative.findIndex((seen) => seen >= count / 2)
  return found === -1 ? 0 : found
}

function glyphCore(input: {
  tile: {raster: Raster; box: Box}
  glyphs: Box[]
  background: string
  color: (input: {a: string; b: string}) => number
}): string | null {
  const {tile, glyphs, background, color} = input
  const {raster, box: area} = tile
  const known = new Map<number, number>()
  const distances = Float64Array.from(range(raster.width * raster.height), (index) => {
    const x = (index % area.w) + area.x
    const y = Math.floor(index / area.w) + area.y
    if (!glyphs.some((glyph) => x >= glyph.x && x < glyph.x + glyph.w && y >= glyph.y && y < glyph.y + glyph.h))
      return -1
    const [r, g, b] = raster.rgb(index)
    const key = (r << 16) | (g << 8) | b
    const measured = known.get(key) ?? color({a: designConfig.hex([r, g, b]), b: background})
    known.set(key, measured)
    return measured
  })
  const peak = distances.reduce((top, value) => Math.max(top, value), 0)
  if (peak <= TOLERANCES.colorDeltaE) return null
  const exclude = Uint8Array.from(distances, (value) => (value >= 0 && value >= peak - TOLERANCES.colorDeltaE ? 0 : 1))
  return designConfig.hex(medianRgb({pixels: pixelsOf(raster), exclude}))
}

function pixelsOf(raster: Raster): Pixels {
  return {width: raster.width, height: raster.height, data: raster.pixels()}
}

function boxBlur(input: {pixels: Pixels; radius: number}): Pixels {
  if (input.radius <= 0) return input.pixels
  const once = blurPass({pixels: input.pixels, radius: input.radius, horizontal: true})
  return blurPass({pixels: once, radius: input.radius, horizontal: false})
}

function blurPass(input: {pixels: Pixels; radius: number; horizontal: boolean}): Pixels {
  const {pixels, radius, horizontal} = input
  const {width, height, data: source} = pixels
  const offsets = range(-radius, radius + 1)
  const data = Uint8Array.from({length: source.length}, (_, byte) => {
    const channel = byte % 4
    const index = (byte - channel) / 4
    const x = index % width
    const y = (index - x) / width
    const sum = offsets.reduce((total, offset) => {
      const at = horizontal ? y * width + clamp(x + offset, 0, width - 1) : clamp(y + offset, 0, height - 1) * width + x
      return total + (source[at * 4 + channel] ?? 0)
    }, 0)
    return Math.round(sum / (radius * 2 + 1))
  })
  return {width, height, data}
}

function diffMask(input: {output: Uint8Array; width: number; height: number}): Uint8Array {
  const {output, width, height} = input
  return Uint8Array.from({length: width * height}, (_, i) => {
    const red = output[i * 4] === 255 && output[i * 4 + 1] === 0 && output[i * 4 + 2] === 0
    return red && output[i * 4 + 3] === 255 ? 1 : 0
  })
}

const EDGE_THRESHOLD = 48
const MINIMUM_TRIM_SIDE = 2
const DIFF_OPTIONS = {threshold: TOLERANCES.perceptualThreshold, includeAA: false, diffMask: true} as const
const DIFF_RED = [255, 0, 0, 255]
