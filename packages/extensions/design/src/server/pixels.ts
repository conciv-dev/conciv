import {createHash} from 'node:crypto'
import {mean, partition, range} from 'es-toolkit'
import {ssim} from 'ssim.js'
import {TOLERANCES} from '../shared/tolerances.js'
import {
  type Box,
  type Clock,
  type Grid,
  type PixelComparator,
  type Pixels,
  type Raster,
  type ScoredTile,
  type TileCache,
  type TileRecord,
} from '../shared/defs.js'
import {crop, labelRegions} from './raster.js'
import {expand, intersection, union} from '../shared/box.js'

export function createPixels(input: {comparator: PixelComparator}): Pixels {
  const {comparator} = input
  return {
    compare: (request) => comparePages({...request, comparator}),
    similarity: similarityTiles,
    mean: ({tiles, within}) =>
      meanSimilarity(within === undefined ? tiles : tiles.filter((tile) => centred({inner: tile.box, outer: within}))),
    paintOver,
    paintDiff,
    share: maskShare,
    reuse: reuseFrom,
  }
}

function reuseFrom(input: Parameters<Pixels['reuse']>[0]): ReturnType<Pixels['reuse']> {
  const {before, live, target} = input
  const width = Math.min(live.width, target.width)
  const height = Math.min(live.height, target.height)
  const grid = tileGrid({width, height, side: TOLERANCES.tileSide})
  const rawTiles = tileHashes({raster: live, grid, margin: COMPARE_REACH})
  if (before === null || !sameGrid({a: before.grid, b: grid})) return {grid, rawTiles, reuse: null}
  const changed = new Set(rawTiles.flatMap((hash, index) => (before.rawTiles[index] === hash ? [] : [index])))
  const reuse = {
    textMasks: before.textMasks,
    measures: before.measures,
    unchanged: (box: Box) => tilesUnder({grid, box}).every((index) => !changed.has(index)),
  }
  return {grid, rawTiles, reuse}
}

function comparePages(input: {
  live: Raster
  target: Raster
  comparator: PixelComparator
  previous: TileCache | null
  clock: Clock
}): {
  mismatch: number
  mask: Uint8Array
  width: number
  height: number
  tiles: TileCache
  carried: number
} {
  const {live, target, comparator, previous, clock} = input
  const width = Math.min(live.width, target.width)
  const height = Math.min(live.height, target.height)
  const grid = tileGrid({width, height, side: TOLERANCES.tileSide})
  const hashes = tileHashes({raster: live, grid, margin: COMPARE_REACH})
  const reusable = previous !== null && sameGrid({a: previous, b: grid}) ? previous.tiles : []
  const boxes = hashes.map((_, index) => tileBox({grid, index}))
  const changed = hashes.flatMap((hash, index) => (reusable[index]?.hash === hash ? [] : [index]))
  const mask = new Uint8Array(width * height)
  reusable.forEach((tile, index) => {
    const box = boxes[index]
    if (box === undefined || tile.hash !== hashes[index] || tile.mask === undefined) return
    unpackMask({packed: tile.mask, mask, width, box})
  })
  compareAreas({
    clusters: clusters({grid, changed}).map((cluster) => cluster.flatMap((index) => boxes[index] ?? [])),
    width,
    height,
  }).forEach((area) => compareTiles({live, target, comparator, mask, width, clock, ...area}))
  const tiles = hashes.map((hash, index): TileRecord => {
    const kept = reusable[index]
    if (kept !== undefined && kept.hash === hash) return kept
    const box = boxes[index] ?? {x: 0, y: 0, w: 0, h: 0}
    const count = maskCount({mask, width, box})
    return count === 0
      ? {hash, mismatch: 0}
      : {hash, mismatch: count / (box.w * box.h), mask: packMask({mask, width, box})}
  })
  const total = width * height
  const differing = tiles.reduce((sum, tile, index) => sum + Math.round(tile.mismatch * tileArea(boxes[index])), 0)
  const mismatch = total === 0 ? 0 : differing / total
  clock.lap('mask')
  return {
    mismatch,
    mask,
    width,
    height,
    tiles: {side: grid.side, columns: grid.columns, rows: grid.rows, width, height, tiles},
    carried: hashes.length - changed.length,
  }
}

function clusters(input: {grid: Grid; changed: number[]}): number[][] {
  const {grid, changed} = input
  const wanted = new Set(changed)
  const cells = Uint8Array.from(range(grid.columns * grid.rows), (index) => (wanted.has(index) ? 1 : 0))
  return findRegions({mask: cells, width: grid.columns, height: grid.rows, minSize: 1}).map((region) =>
    changed.filter((index) => {
      const column = index % grid.columns
      const row = (index - column) / grid.columns
      return column >= region.x && column < region.x + region.w && row >= region.y && row < region.y + region.h
    }),
  )
}

function tileArea(box: Box | undefined): number {
  return box === undefined ? 0 : box.w * box.h
}

function sameGrid(input: {a: Pick<Grid, 'side' | 'width' | 'height'>; b: Grid}): boolean {
  const {a, b} = input
  return a.side === b.side && a.width === b.width && a.height === b.height
}

type CompareArea = {area: Box; boxes: Box[]}

function compareAreas(input: {clusters: Box[][]; width: number; height: number}): CompareArea[] {
  const {width, height} = input
  return input.clusters
    .filter((boxes) => boxes.length > 0)
    .map((boxes): CompareArea => {
      const reach = expand({box: union(boxes), by: TOLERANCES.tileSide})
      const x = Math.max(0, reach.x)
      const y = Math.max(0, reach.y)
      return {
        area: {x, y, w: Math.min(width, reach.x + reach.w) - x, h: Math.min(height, reach.y + reach.h) - y},
        boxes,
      }
    })
    .reduce((kept: CompareArea[], next) => absorbed({kept, next}), [])
}

function absorbed(input: {kept: CompareArea[]; next: CompareArea}): CompareArea[] {
  const {kept, next} = input
  const [touching, apart] = partition(kept, (other) => intersection({a: other.area, b: next.area}) !== null)
  if (touching.length === 0) return [...kept, next]
  return absorbed({
    kept: apart,
    next: {
      area: union([next.area, ...touching.map((other) => other.area)]),
      boxes: [...next.boxes, ...touching.flatMap((other) => other.boxes)],
    },
  })
}

function compareTiles(input: {
  live: Raster
  target: Raster
  comparator: PixelComparator
  mask: Uint8Array
  width: number
  area: Box
  boxes: Box[]
  clock: Clock
}): void {
  const {live, target, comparator, mask, width, area, boxes, clock} = input
  const a = boxBlur({raster: crop({raster: live, box: area}).raster, radius: TOLERANCES.blurRadius})
  const b = boxBlur({raster: crop({raster: target, box: area}).raster, radius: TOLERANCES.blurRadius})
  const compared = comparator.compare({a, b})
  clock.lap('mask')
  boxes.forEach((box) => copyMask({from: compared.mask, fromArea: area, onto: mask, width, box}))
}

function paintDiff(input: {live: Raster; mask: Uint8Array; width: number}): Raster {
  const {live, mask, width} = input
  const data = new Uint8Array(live.data)
  mask.forEach((value, index) => {
    if (value !== 1) return
    const x = index % width
    const y = (index - x) / width
    data.set([255, 0, 0, 255], (y * live.width + x) * 4)
  })
  return {width: live.width, height: live.height, data}
}

function centred(input: {inner: Box; outer: Box}): boolean {
  const {inner, outer} = input
  const x = inner.x + inner.w / 2
  const y = inner.y + inner.h / 2
  return x >= outer.x && x < outer.x + outer.w && y >= outer.y && y < outer.y + outer.h
}

function tilesUnder(input: {grid: Grid; box: Box}): number[] {
  const {grid, box} = input
  const left = Math.max(0, Math.floor(box.x / grid.side))
  const right = Math.min(grid.columns - 1, Math.floor((box.x + box.w) / grid.side))
  const top = Math.max(0, Math.floor(box.y / grid.side))
  const bottom = Math.min(grid.rows - 1, Math.floor((box.y + box.h) / grid.side))
  return range(top, bottom + 1).flatMap((row) => range(left, right + 1).map((column) => row * grid.columns + column))
}

const COMPARE_REACH = TOLERANCES.blurRadius + 2

function similarityTiles(input: {
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

function meanSimilarity(tiles: ScoredTile[]): number {
  return tiles.length === 0 ? 1 : mean(tiles.map((tile) => tile.similarity))
}

function maskShare(input: {mask: Uint8Array; width: number; height: number; box: Box}): number {
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

function paintOver(input: {onto: Raster; from: Raster; boxes: Box[]}): Raster {
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

function findRegions(input: {mask: Uint8Array; width: number; height: number; minSize: number}): Box[] {
  return labelRegions(input)
    .regions.filter((region) => region.size >= input.minSize)
    .map((region) => region.box)
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

function boxBlur(input: {raster: Raster; radius: number}): Raster {
  if (input.radius <= 0) return input.raster
  const once = blurPass({raster: input.raster, radius: input.radius, horizontal: true})
  return blurPass({raster: once, radius: input.radius, horizontal: false})
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

function tileGrid(input: {width: number; height: number; side: number}): Grid {
  const {width, height, side} = input
  return {side, columns: Math.ceil(width / side), rows: Math.ceil(height / side), width, height}
}

function tileBox(input: {grid: Grid; index: number}): Box {
  const {grid, index} = input
  const column = index % grid.columns
  const row = (index - column) / grid.columns
  const x = column * grid.side
  const y = row * grid.side
  return {x, y, w: Math.min(grid.side, grid.width - x), h: Math.min(grid.side, grid.height - y)}
}

function tileHashes(input: {raster: Raster; grid: Grid; margin: number}): string[] {
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

function packMask(input: {mask: Uint8Array; width: number; box: Box}): string {
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

function unpackMask(input: {packed: string; mask: Uint8Array; width: number; box: Box}): void {
  const {mask, width, box} = input
  const bits = Buffer.from(input.packed, 'base64')
  range(box.w * box.h).forEach((cell) => {
    if (((bits[cell >> 3] ?? 0) & (1 << (cell & 7))) === 0) return
    const column = cell % box.w
    mask[(box.y + (cell - column) / box.w) * width + box.x + column] = 1
  })
}

function copyMask(input: {from: Uint8Array; fromArea: Box; onto: Uint8Array; width: number; box: Box}): void {
  const {from, fromArea, onto, width, box} = input
  range(box.h).forEach((row) => {
    const start = (box.y + row - fromArea.y) * fromArea.w + box.x - fromArea.x
    onto.set(from.subarray(start, start + box.w), (box.y + row) * width + box.x)
  })
}

function maskCount(input: {mask: Uint8Array; width: number; box: Box}): number {
  const {mask, width, box} = input
  return range(box.h).reduce((total, row) => {
    const start = (box.y + row) * width + box.x
    return total + mask.subarray(start, start + box.w).reduce((sum, value) => sum + value, 0)
  }, 0)
}
