import {partition, range} from 'es-toolkit'
import type {Box, Delta, Raster} from '../shared/defs.js'
import {box as boxes} from '../shared/box.js'
import {designConfig} from '../shared/tolerances.js'

export function createTiles() {
  const settled = new Map<string, Settled>()
  return {
    before: (key: string | null): Settled | null => (key === null ? null : (settled.get(key) ?? null)),
    reuse: (input: {
      before: Settled | null
      live: Raster
      target: Raster
    }): {
      grid: Grid
      rawTiles: string[]
      reuse: Reuse | null
    } => reuseFrom(input),
    compare: (input: {live: Raster; target: Raster; comparator: string; previous: TileCache | null}): Compared =>
      comparePages(input),
    remember: (input: {key: string; value: Settled}): void => remember({...input, settled}),
    dispose: (): void => settled.clear(),
  }
}

type Grid = {side: number; columns: number; rows: number; width: number; height: number}

type TileRecord = {hash: string; mismatch: number; mask?: string}

type TileCache = Grid & {tiles: TileRecord[]}

type Settled = {
  grid: Grid
  rawTiles: string[]
  tiles: TileCache
  textMasks: Map<string, Box[]>
  measures: Map<string, Delta[]>
}

type Reuse = {textMasks: Map<string, Box[]>; measures: Map<string, Delta[]>; unchanged: (box: Box) => boolean}

type Compared = {mismatch: number; mask: Uint8Array; width: number; height: number; tiles: TileCache; carried: number}

const TOLERANCES = designConfig.tolerances

const COMPARE_REACH = TOLERANCES.blurRadius + 2

const SETTLED_KEPT = 8

const NO_BOX: Box = {x: 0, y: 0, w: 0, h: 0}

function remember(input: {settled: Map<string, Settled>; key: string; value: Settled}): void {
  const {settled, key, value} = input
  settled.delete(key)
  settled.set(key, value)
  const oldest = [...settled.keys()].slice(0, Math.max(0, settled.size - SETTLED_KEPT))
  oldest.forEach((stale) => settled.delete(stale))
}

function reuseFrom(input: {before: Settled | null; live: Raster; target: Raster}): {
  grid: Grid
  rawTiles: string[]
  reuse: Reuse | null
} {
  const {before, live, target} = input
  const grid = tileGrid({width: Math.min(live.width, target.width), height: Math.min(live.height, target.height)})
  const rawTiles = live.hashes({grid, margin: COMPARE_REACH})
  if (before === null || !sameGrid({a: before.grid, b: grid})) return {grid, rawTiles, reuse: null}
  const changed = new Set(rawTiles.flatMap((hash, index) => (before.rawTiles[index] === hash ? [] : [index])))
  return {
    grid,
    rawTiles,
    reuse: {
      textMasks: before.textMasks,
      measures: before.measures,
      unchanged: (box) => tilesUnder({grid, box}).every((index) => !changed.has(index)),
    },
  }
}

function comparePages(input: {live: Raster; target: Raster; comparator: string; previous: TileCache | null}): Compared {
  const {live, target, comparator, previous} = input
  const grid = tileGrid({width: Math.min(live.width, target.width), height: Math.min(live.height, target.height)})
  const {width, height} = grid
  const hashes = live.hashes({grid, margin: COMPARE_REACH})
  const reusable = previous !== null && sameGrid({a: previous, b: grid}) ? previous.tiles : []
  const tileBoxes = hashes.map((_, index) => tileBox({grid, index}))
  const changed = hashes.flatMap((hash, index) => (reusable[index]?.hash === hash ? [] : [index]))
  const mask = new Uint8Array(width * height)
  reusable.forEach((tile, index) => {
    const box = tileBoxes[index]
    if (box === undefined || tile.hash !== hashes[index] || tile.mask === undefined) return
    unpackMask({packed: tile.mask, mask, width, box})
  })
  compareAreas({
    clusters: clusters({grid, changed}).map((cluster) => cluster.flatMap((index) => tileBoxes[index] ?? [])),
    width,
    height,
  }).forEach((area) => compareTiles({live, target, comparator, mask, width, ...area}))
  const tiles = hashes.map((hash, index): TileRecord => {
    const kept = reusable[index]
    if (kept !== undefined && kept.hash === hash) return kept
    const box = tileBoxes[index] ?? NO_BOX
    const count = maskCount({mask, width, box})
    return count === 0
      ? {hash, mismatch: 0}
      : {hash, mismatch: count / (box.w * box.h), mask: packMask({mask, width, box})}
  })
  const total = width * height
  const differing = tiles.reduce(
    (sum, tile, index) => sum + Math.round(tile.mismatch * boxes.area(tileBoxes[index] ?? NO_BOX)),
    0,
  )
  return {
    mismatch: total === 0 ? 0 : differing / total,
    mask,
    width,
    height,
    tiles: {...grid, tiles},
    carried: hashes.length - changed.length,
  }
}

function tileGrid(input: {width: number; height: number}): Grid {
  const {width, height} = input
  const side = TOLERANCES.tileSide
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

function sameGrid(input: {a: Pick<Grid, 'side' | 'width' | 'height'>; b: Grid}): boolean {
  const {a, b} = input
  return a.side === b.side && a.width === b.width && a.height === b.height
}

function tilesUnder(input: {grid: Grid; box: Box}): number[] {
  const {grid, box} = input
  const left = Math.max(0, Math.floor(box.x / grid.side))
  const right = Math.min(grid.columns - 1, Math.floor((box.x + box.w) / grid.side))
  const top = Math.max(0, Math.floor(box.y / grid.side))
  const bottom = Math.min(grid.rows - 1, Math.floor((box.y + box.h) / grid.side))
  return range(top, bottom + 1).flatMap((row) => range(left, right + 1).map((column) => row * grid.columns + column))
}

function clusters(input: {grid: Grid; changed: number[]}): number[][] {
  const {grid} = input
  const wanted = new Set(input.changed)
  const seen = new Set<number>()
  return input.changed.flatMap((start) => {
    if (seen.has(start)) return []
    seen.add(start)
    const found: number[] = []
    const stack = [start]
    while (stack.length > 0) {
      const index = stack.pop() ?? start
      found.push(index)
      const column = index % grid.columns
      const neighbours = [
        column > 0 ? index - 1 : -1,
        column < grid.columns - 1 ? index + 1 : -1,
        index - grid.columns,
        index + grid.columns,
      ]
      neighbours.forEach((next) => {
        if (!wanted.has(next) || seen.has(next)) return
        seen.add(next)
        stack.push(next)
      })
    }
    return [found]
  })
}

type CompareArea = {area: Box; boxes: Box[]}

function compareAreas(input: {clusters: Box[][]; width: number; height: number}): CompareArea[] {
  const {width, height} = input
  return input.clusters
    .filter((cluster) => cluster.length > 0)
    .map((cluster): CompareArea => {
      const reach = boxes.expand({box: boxes.union(cluster), by: TOLERANCES.tileSide})
      const x = Math.max(0, reach.x)
      const y = Math.max(0, reach.y)
      return {
        area: {x, y, w: Math.min(width, reach.x + reach.w) - x, h: Math.min(height, reach.y + reach.h) - y},
        boxes: cluster,
      }
    })
    .reduce((kept: CompareArea[], next) => absorbed({kept, next}), [])
}

function absorbed(input: {kept: CompareArea[]; next: CompareArea}): CompareArea[] {
  const {kept, next} = input
  const [touching, apart] = partition(kept, (other) => boxes.intersection({a: other.area, b: next.area}) !== null)
  if (touching.length === 0) return [...kept, next]
  return absorbed({
    kept: apart,
    next: {
      area: boxes.union([next.area, ...touching.map((other) => other.area)]),
      boxes: [...next.boxes, ...touching.flatMap((other) => other.boxes)],
    },
  })
}

function compareTiles(input: {
  live: Raster
  target: Raster
  comparator: string
  mask: Uint8Array
  width: number
  area: Box
  boxes: Box[]
}): void {
  const {live, target, comparator, mask, width, area} = input
  const a = live.crop({box: area}).blur(TOLERANCES.blurRadius)
  const b = target.crop({box: area}).blur(TOLERANCES.blurRadius)
  const compared = a.compare({other: b, comparator})
  input.boxes.forEach((box) => copyMask({from: compared.mask, fromArea: area, onto: mask, width, box}))
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
