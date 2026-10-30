import {TOLERANCES} from '../shared/tolerances.js'
import type {Box, LiveCapture, Pair, Raster, TargetModel, Unmatched} from '../shared/types.js'
import {expand} from './matchers/tile.js'
import {crop, edgeDensity, edgeMap, findRegions} from './raster.js'

const BLANK_DENSITY = 0.01

function blank(input: {raster: Raster; box: Box}): boolean {
  return edgeDensity(edgeMap(crop(input).raster)) < BLANK_DENSITY
}

function zeroed(input: {edges: Uint8Array; width: number; height: number; boxes: Box[]}): Uint8Array {
  const {edges, width, height, boxes} = input
  boxes.forEach((box) => {
    const area = expand({box, by: TOLERANCES.tileMargin})
    const x0 = Math.max(0, Math.floor(area.x))
    const x1 = Math.min(width, Math.ceil(area.x + area.w))
    for (let y = Math.max(0, Math.floor(area.y)); y < Math.min(height, Math.ceil(area.y + area.h)); y += 1) {
      if (x1 > x0) edges.fill(0, y * width + x0, y * width + x1)
    }
  })
  return edges
}

export function unmatchedRegions(input: {
  target: TargetModel
  matched: Box[]
  pairs: Pair[]
  live: LiveCapture
}): Unmatched[] {
  const {target, matched, pairs, live} = input
  const {width, height} = target.raster
  const minimum = TOLERANCES.unmatchedMinimum
  const missing = findRegions({
    mask: zeroed({edges: edgeMap(target.raster), width, height, boxes: matched}),
    width,
    height,
    minSize: minimum,
  })
    .filter((box) => box.w >= minimum && box.h >= minimum)
    .map((box): Unmatched => ({kind: 'missing', target: box}))
  const extras = new Set<Pair>()
  pairs.forEach((pair) => {
    if (pair.parent !== null && extras.has(pair.parent)) return
    if (!blank({raster: target.raster, box: pair.liveBox}) || blank({raster: live.raster, box: pair.liveBox})) return
    extras.add(pair)
  })
  const extra = [...extras].map(
    (pair): Unmatched => ({
      kind: 'extra',
      live: pair.liveBox,
      ...(pair.live.source === null ? {} : {source: pair.live.source}),
    }),
  )
  return [...missing, ...extra]
}
