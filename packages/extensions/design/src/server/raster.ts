import {createHash} from 'node:crypto'
import {diff} from '@blazediff/core'
import {clamp, range} from 'es-toolkit'
import pixelmatch from 'pixelmatch'
import {PNG} from 'pngjs'
import {ssim} from 'ssim.js'
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

type Grid = Parameters<Raster['hashes']>[0]['grid']

const TOLERANCES = designConfig.tolerances

function rasterOf(pixels: Pixels): Raster {
  const {width, height, data} = pixels
  const raster: Raster = {
    width,
    height,
    crop: (input) => region(input).raster,
    scaled,
    rgb,
    ink,
    fills,
    median,
    png,
    pixels: () => data,
    region,
    trim,
    edges: () => edgeMap(pixels),
    blur: (radius) => rasterOf(boxBlur({pixels, radius})),
    compare,
    paintOver,
    paintDiff,
    similarity,
    coverage,
    radius: (input) => cornerRadius({...input, raster}),
    hashes,
    cutout,
    beside,
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

  function ink(box: Box): number {
    const inked = inkCells(box)
    if (inked === null || inked.size === 0) return 0
    return inked.cells.length / inked.size
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

  function paintOver(input: {from: Raster; boxes: Box[]}): Raster {
    const from = pixelsOf(input.from)
    const out = new Uint8Array(data)
    const w = Math.min(width, from.width)
    const h = Math.min(height, from.height)
    input.boxes.forEach((box) => {
      const x0 = Math.max(0, Math.floor(box.x))
      const x1 = Math.min(w, Math.ceil(box.x + box.w))
      if (x1 <= x0) return
      range(Math.max(0, Math.floor(box.y)), Math.min(h, Math.ceil(box.y + box.h))).forEach((y) => {
        out.set(from.data.subarray((y * from.width + x0) * 4, (y * from.width + x1) * 4), (y * width + x0) * 4)
      })
    })
    return rasterOf({width, height, data: out})
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

  function similarity(input: {
    target: Raster
    mask: Uint8Array
    differing: Uint8Array
    width: number
    height: number
  }): {box: Box; similarity: number}[] {
    const {mask, differing} = input
    const side = TOLERANCES.similarityTile
    if (input.width === 0 || input.height === 0) return []
    const page = {x: 0, y: 0, w: input.width, h: input.height}
    const target = input.target.crop({box: page}).pixels()
    const live = region({box: page}).raster.pixels()
    const seen = Uint8Array.from(target)
    differing.forEach((bit, index) => {
      if (bit === 1) seen.set(live.subarray(index * 4, index * 4 + 4), index * 4)
    })
    const size = {width: input.width, height: input.height}
    const map = ssim(imageData({...size, data: seen}), imageData({...size, data: target}), {
      ssim: 'bezkrovny',
      windowSize: side,
      downsample: false,
    }).ssim_map
    return map.data.flatMap((value, index) => {
      const column = index % map.width
      const row = (index - column) / map.width
      const box = {
        x: column * side,
        y: row * side,
        w: Math.min(side, input.width - column * side),
        h: Math.min(side, input.height - row * side),
      }
      return maskShare({mask, width: input.width, height: input.height, box}) < 1 ? [{box, similarity: value}] : []
    })
  }

  function coverage(input: {box: Box; background: Rgb; threshold: number}): number {
    const {box, background, threshold} = input
    const area = box.w * box.h
    if (area <= 0) return 0
    const covered = range(box.y, box.y + box.h).reduce(
      (total, y) =>
        total +
        range(box.x, box.x + box.w).filter((x) => distanceRgb({a: rgb(y * width + x), b: background}) > threshold)
          .length,
      0,
    )
    return covered / area
  }

  function hashes(input: {grid: Grid; margin: number}): string[] {
    const {grid, margin} = input
    return range(grid.columns * grid.rows).map((index) => {
      const box = tileBox({grid, index})
      const x0 = Math.max(0, box.x - margin)
      const x1 = Math.min(grid.width, box.x + box.w + margin)
      const hash = createHash('sha1')
      range(Math.max(0, box.y - margin), Math.min(grid.height, box.y + box.h + margin)).forEach((y) => {
        hash.update(data.subarray((y * width + x0) * 4, (y * width + x1) * 4))
      })
      return hash.digest('base64')
    })
  }

  function cutout(box: Box): Raster {
    const out = new Uint8Array(box.w * box.h * 4)
    range(box.h).forEach((row) => {
      const y = box.y + row
      if (y < 0 || y >= height) return
      const left = Math.max(0, box.x)
      const right = Math.min(width, box.x + box.w)
      if (right <= left) return
      const start = (y * width + left) * 4
      out.set(data.subarray(start, start + (right - left) * 4), (row * box.w + left - box.x) * 4)
    })
    return rasterOf({width: box.w, height: box.h, data: out})
  }

  function beside(input: {others: Raster[]; gap: number}): Raster {
    const all = [raster, ...input.others]
    const total = all.reduce((sum, entry) => sum + entry.width, 0) + input.gap * Math.max(0, all.length - 1)
    const tallest = Math.max(0, ...all.map((entry) => entry.height))
    const out = new Uint8Array(total * tallest * 4)
    all.reduce((left, entry) => {
      const source = entry.pixels()
      range(entry.height).forEach((row) => {
        const start = row * entry.width * 4
        out.set(source.subarray(start, start + entry.width * 4), (row * total + left) * 4)
      })
      return left + entry.width + input.gap
    }, 0)
    return rasterOf({width: total, height: tallest, data: out})
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

function maskShare(input: {mask: Uint8Array; width: number; height: number; box: Box}): number {
  const {mask, width, height, box} = input
  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const x1 = Math.min(width, Math.ceil(box.x + box.w))
  const y1 = Math.min(height, Math.ceil(box.y + box.h))
  if (x1 <= x0 || y1 <= y0) return 0
  const count = range(y0, y1).reduce(
    (total, y) => total + mask.subarray(y * width + x0, y * width + x1).filter((value) => value === 1).length,
    0,
  )
  return count / ((x1 - x0) * (y1 - y0))
}

function imageData(pixels: Pixels): {data: Uint8ClampedArray; width: number; height: number} {
  return {
    data: new Uint8ClampedArray(pixels.data.buffer, pixels.data.byteOffset, pixels.data.length),
    width: pixels.width,
    height: pixels.height,
  }
}

function cornerRadius(input: {raster: Raster; box: Box; inside: Rgb; outside: Rgb}): number {
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
  const middle = ((depths[1] ?? 0) + (depths[2] ?? 0)) / 2
  return Math.round(middle / DIAGONAL_SHARE)
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
  return range(limit).reduce(
    (state, i) => {
      if (state.stopped) return state
      const x = corner.x + step.x * i
      const y = corner.y + step.y * i
      const span = distanceRgb({a: fillAt({raster, box, x, y, inside}), b: outside})
      if (span === 0) return {...state, stopped: true}
      const covered = Math.min(1, distanceRgb({a: raster.rgb(y * raster.width + x), b: outside}) / span)
      return {depth: state.depth + 1 - covered, stopped: covered >= 1}
    },
    {depth: 0, stopped: false},
  ).depth
}

function fillAt(input: {raster: Raster; box: Box; x: number; y: number; inside: Rgb}): Rgb {
  const {raster, box, x, y, inside} = input
  const inset = TOLERANCES.interiorInset
  if (box.w <= inset * 2 || box.h <= inset * 2) return inside
  const at = {
    x: clamp(x, box.x + inset, box.x + box.w - inset - 1),
    y: clamp(y, box.y + inset, box.y + box.h - inset - 1),
  }
  const column = lineMedian({
    raster,
    indices: range(box.y + inset, box.y + box.h - inset).map((row) => row * raster.width + at.x),
  })
  const row = lineMedian({
    raster,
    indices: range(box.x + inset, box.x + box.w - inset).map((across) => at.y * raster.width + across),
  })
  const channel = (c: 0 | 1 | 2): number => Math.min(255, Math.max(0, column[c] + row[c] - inside[c]))
  return [channel(0), channel(1), channel(2)]
}

function lineMedian(input: {raster: Raster; indices: number[]}): Rgb {
  const {raster, indices} = input
  const data = raster.pixels()
  const channel = (c: number): number => {
    const sorted = indices.map((index) => data[index * 4 + c] ?? 0).toSorted((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)] ?? 0
  }
  return [channel(0), channel(1), channel(2)]
}

function tileBox(input: {grid: Grid; index: number}): Box {
  const {grid, index} = input
  const column = index % grid.columns
  const row = (index - column) / grid.columns
  const x = column * grid.side
  const y = row * grid.side
  return {x, y, w: Math.min(grid.side, grid.width - x), h: Math.min(grid.side, grid.height - y)}
}

function distanceRgb(input: {a: Rgb; b: Rgb}): number {
  const {a, b} = input
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

const EDGE_THRESHOLD = 48
const MINIMUM_TRIM_SIDE = 2
const DIAGONAL_SHARE = 1 - Math.SQRT1_2
const DIFF_OPTIONS = {threshold: 0.1, includeAA: false, diffMask: true} as const
const DIFF_RED = [255, 0, 0, 255]
