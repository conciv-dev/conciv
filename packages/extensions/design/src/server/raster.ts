import {range} from 'es-toolkit'
import {PNG} from 'pngjs'
import {hex, TOLERANCES} from '../shared/tolerances.js'
import type {Box, ColorMetric, Pixels, Raster, Rgb} from '../shared/defs.js'

export function createRaster(png: Uint8Array): Raster {
  const decoded = PNG.sync.read(Buffer.from(png))
  return rasterOf({width: decoded.width, height: decoded.height, data: new Uint8Array(decoded.data)})
}

function rasterOf(pixels: Pixels): Raster {
  const {width, height, data} = pixels
  const raster: Raster = {...pixels, from: rasterOf, png, crop, scaled, rgb, ink, fills, median}
  return raster

  function png(): Uint8Array {
    const encoded = new PNG({width, height})
    encoded.data = Buffer.from(data)
    return new Uint8Array(PNG.sync.write(encoded))
  }

  function crop(input: {box: Box; margin?: number}): {raster: Raster; box: Box} {
    const {box} = input
    const margin = input.margin ?? 0
    const x0 = Math.min(width, Math.max(0, Math.floor(box.x - margin)))
    const y0 = Math.min(height, Math.max(0, Math.floor(box.y - margin)))
    const w = Math.max(x0, Math.min(width, Math.ceil(box.x + box.w + margin))) - x0
    const h = Math.max(y0, Math.min(height, Math.ceil(box.y + box.h + margin))) - y0
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

  function ink(box: Box): Box {
    const x = Math.max(0, Math.floor(box.x))
    const y = Math.max(0, Math.floor(box.y))
    const w = Math.min(width - x, Math.ceil(box.w))
    const h = Math.min(height - y, Math.ceil(box.h))
    if (w < MINIMUM_TRIM_SIDE || h < MINIMUM_TRIM_SIDE) return box
    const tile = crop({box: {x, y, w, h}}).raster
    const background = tile.data.slice(0, 4)
    const inked = range(w * h).filter((index) =>
      range(4).some(
        (channel) =>
          Math.abs((tile.data[index * 4 + channel] ?? 0) - (background[channel] ?? 0)) > TOLERANCES.inkTrimThreshold,
      ),
    )
    if (inked.length === 0) return box
    const edges = inked.reduce(
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

  function fills(input: {box: Box; glyphs: Box[]; color: ColorMetric}): {
    background: string
    foreground: string | null
  } {
    const tile = crop({box: input.box})
    const background = tile.raster.median(edgeMap(tile.raster))
    return {background, foreground: glyphCore({tile, glyphs: input.glyphs, background, color: input.color})}
  }

  function median(exclude: Uint8Array): string {
    const histograms = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
    const kept = range(width * height).filter((index) => exclude[index] !== 1)
    kept.forEach((index) =>
      histograms.forEach((histogram, channel) => {
        const value = data[index * 4 + channel] ?? 0
        histogram[value] = (histogram[value] ?? 0) + 1
      }),
    )
    return hex(histograms.map((histogram) => channelMedian({histogram, count: kept.length})))
  }
}

function edgeMap(raster: Raster): Uint8Array {
  const {width, height, data} = raster
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

function glyphCore(input: {
  tile: {raster: Raster; box: Box}
  glyphs: Box[]
  background: string
  color: ColorMetric
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
    const measured = known.get(key) ?? color.distance({a: hex([r, g, b]), b: background})
    known.set(key, measured)
    return measured
  })
  const peak = distances.reduce((top, value) => Math.max(top, value), 0)
  if (peak <= TOLERANCES.colorDeltaE) return null
  return raster.median(
    Uint8Array.from(distances, (value) => (value >= 0 && value >= peak - TOLERANCES.colorDeltaE ? 0 : 1)),
  )
}

function channelMedian(input: {histogram: Uint32Array; count: number}): number {
  const {histogram, count} = input
  const cumulative = [...histogram].reduce<number[]>((sums, value) => [...sums, (sums.at(-1) ?? 0) + value], [])
  const found = cumulative.findIndex((seen) => seen >= count / 2)
  return found === -1 ? 0 : found
}

const EDGE_THRESHOLD = 48
const MINIMUM_TRIM_SIDE = 2
