import {nodeId} from '../shared/model-schemas.js'
import {TOLERANCES} from '../shared/tolerances.js'
import type {Border, Box, BoxNode, ImageNode, Raster, Segmenter} from '../shared/types.js'
import {
  cornerRadius,
  expand,
  hex,
  inkCoverage,
  labelRegions,
  openMask,
  rgbAt,
  rgbDistance,
  type Region,
  type Rgb,
} from './raster.js'

const RECTANGULAR = 0.85
const FILLED = 0.6
const DOMINANT = 0.5
const OUTLINE_DOMINANT = 0.9
const LARGE_SIDE = 64
const CHILD_INSET = 2
const MAX_DEPTH = 6
const MAX_BORDER = 4

type Found = BoxNode | ImageNode
type Level = {raster: Raster; region: Box; background: Rgb; depth: number; text: Box[]}

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function medianRgb(input: {raster: Raster; indices: number[]}): Rgb {
  const {raster, indices} = input
  const channel = (offset: number) => median(indices.map((index) => raster.data[index * 4 + offset] ?? 0))
  return [channel(0), channel(1), channel(2)]
}

function boxIndices(input: {raster: Raster; box: Box}): number[] {
  const {raster, box} = input
  const indices: number[] = []
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) indices.push(y * raster.width + x)
  }
  return indices
}

function rowIndices(input: {width: number; y: number; x0: number; x1: number}): number[] {
  const {width, y, x0, x1} = input
  return Array.from({length: Math.max(0, x1 - x0)}, (_, offset) => y * width + x0 + offset)
}

function columnIndices(input: {width: number; x: number; y0: number; y1: number}): number[] {
  const {width, x, y0, y1} = input
  return Array.from({length: Math.max(0, y1 - y0)}, (_, offset) => (y0 + offset) * width + x)
}

function borderIndices(input: {width: number; box: Box}): number[] {
  const {width, box} = input
  const right = box.x + box.w
  const bottom = box.y + box.h
  return [
    ...rowIndices({width, y: box.y, x0: box.x, x1: right}),
    ...rowIndices({width, y: bottom - 1, x0: box.x, x1: right}),
    ...columnIndices({width, x: box.x, y0: box.y, y1: bottom}),
    ...columnIndices({width, x: right - 1, y0: box.y, y1: bottom}),
  ]
}

function inset(input: {box: Box; by: number}): Box {
  const {box, by} = input
  return {x: box.x + by, y: box.y + by, w: Math.max(0, box.w - 2 * by), h: Math.max(0, box.h - 2 * by)}
}

function share(input: {raster: Raster; indices: number[]; color: Rgb}): number {
  const {raster, indices, color} = input
  if (indices.length === 0) return 0
  const close = indices.filter(
    (index) => rgbDistance({a: rgbAt({raster, index}), b: color}) <= TOLERANCES.segmentDistance,
  ).length
  return close / indices.length
}

function intersect(input: {box: Box; region: Box}): Box | null {
  const {box, region} = input
  const x = Math.max(box.x, region.x)
  const y = Math.max(box.y, region.y)
  const w = Math.min(box.x + box.w, region.x + region.w) - x
  const h = Math.min(box.y + box.h, region.y + region.h) - y
  return w > 0 && h > 0 ? {x, y, w, h} : null
}

function threshold(level: Level): Uint8Array {
  const {raster, region, background} = level
  const mask = new Uint8Array(region.w * region.h)
  for (let y = 0; y < region.h; y += 1) {
    for (let x = 0; x < region.w; x += 1) {
      const pixel = rgbAt({raster, index: (region.y + y) * raster.width + region.x + x})
      mask[y * region.w + x] = rgbDistance({a: pixel, b: background}) > TOLERANCES.segmentDistance ? 1 : 0
    }
  }
  level.text.forEach((glyphs) => {
    const area = intersect({box: glyphs, region})
    if (area === null) return
    const local = {x: area.x - region.x, y: area.y - region.y, w: area.w, h: area.h}
    const ring = borderIndices({width: region.w, box: local})
    const on = ring.filter((index) => mask[index] === 1).length
    const value = on * 2 >= ring.length ? 1 : 0
    for (let y = local.y; y < local.y + local.h; y += 1)
      mask.fill(value, y * region.w + local.x, y * region.w + local.x + local.w)
  })
  return mask
}

function spans(input: {region: Box; candidate: Box}): boolean {
  const {region, candidate} = input
  return candidate.w >= region.w - 2 && candidate.h >= region.h - 2
}

function large(box: Box): boolean {
  return box.w >= TOLERANCES.unmatchedMinimum && box.h >= TOLERANCES.unmatchedMinimum
}

function solidity(input: {labels: Int32Array; width: number; region: Region}): number {
  const {labels, width, region} = input
  const {box, label} = region
  let filled = 0
  for (let y = box.y; y < box.y + box.h; y += 1) {
    let first = -1
    let last = -1
    for (let x = box.x; x < box.x + box.w; x += 1) {
      if (labels[y * width + x] !== label) continue
      if (first < 0) first = x
      last = x
    }
    if (first >= 0) filled += last - first + 1
  }
  return filled / (box.w * box.h)
}

function contains(input: {outer: Box; inner: Box}): boolean {
  const {outer, inner} = input
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

function candidates(level: Level): {labels: Int32Array; regions: Region[]} {
  const {region} = level
  const mask = threshold(level)
  const first = labelRegions({mask, width: region.w, height: region.h})
  const spanning = first.regions.some(
    (found) => large(found.box) && spans({region: {...region, x: 0, y: 0}, candidate: found.box}),
  )
  const labelled = spanning
    ? labelRegions({mask: openMask({mask, width: region.w, height: region.h}), width: region.w, height: region.h})
    : first
  const sized = labelled.regions.filter(
    (found) => large(found.box) && !spans({region: {...region, x: 0, y: 0}, candidate: found.box}),
  )
  const outer = sized.filter(
    (found) =>
      !sized.some(
        (other) =>
          other !== found &&
          contains({outer: other.box, inner: found.box}) &&
          other.box.w * other.box.h > found.box.w * found.box.h,
      ),
  )
  return {labels: labelled.labels, regions: outer}
}

type Side = 'left' | 'top' | 'right' | 'bottom'

function reaches(input: {raster: Raster; box: Box; region: Box; side: Side}): boolean {
  const {raster, box, region, side} = input
  switch (side) {
    case 'left':
      return box.x <= region.x && box.x > 0
    case 'top':
      return box.y <= region.y && box.y > 0
    case 'right':
      return box.x + box.w >= region.x + region.w && box.x + box.w < raster.width
    case 'bottom':
      return box.y + box.h >= region.y + region.h && box.y + box.h < raster.height
  }
}

function outside(input: {raster: Raster; box: Box; side: Side}): number[] {
  const {raster, box, side} = input
  const {width} = raster
  switch (side) {
    case 'left':
      return columnIndices({width, x: box.x - 1, y0: box.y, y1: box.y + box.h})
    case 'top':
      return rowIndices({width, y: box.y - 1, x0: box.x, x1: box.x + box.w})
    case 'right':
      return columnIndices({width, x: box.x + box.w, y0: box.y, y1: box.y + box.h})
    case 'bottom':
      return rowIndices({width, y: box.y + box.h, x0: box.x, x1: box.x + box.w})
  }
}

function widened(input: {box: Box; side: Side}): Box {
  const {box, side} = input
  switch (side) {
    case 'left':
      return {...box, x: box.x - 1, w: box.w + 1}
    case 'top':
      return {...box, y: box.y - 1, h: box.h + 1}
    case 'right':
      return {...box, w: box.w + 1}
    case 'bottom':
      return {...box, h: box.h + 1}
  }
}

const SIDES: Side[] = ['left', 'top', 'right', 'bottom']

function grow(input: {raster: Raster; box: Box; region: Box; fill: Rgb}): Box {
  const {raster, region, fill} = input
  const steps = Array.from({length: CHILD_INSET}, () => SIDES).flat()
  return steps.reduce((box, side) => {
    if (!reaches({raster, box, region, side})) return box
    const fits = share({raster, indices: outside({raster, box, side}), color: fill}) >= DOMINANT
    return fits ? widened({box, side}) : box
  }, input.box)
}

function edgeColor(input: {raster: Raster; box: Box; depth: number}): Rgb[] {
  const {raster, box, depth} = input
  const right = box.x + box.w
  const bottom = box.y + box.h
  return [
    rowIndices({width: raster.width, y: box.y + depth, x0: box.x, x1: right}),
    rowIndices({width: raster.width, y: bottom - 1 - depth, x0: box.x, x1: right}),
    columnIndices({width: raster.width, x: box.x + depth, y0: box.y, y1: bottom}),
    columnIndices({width: raster.width, x: right - 1 - depth, y0: box.y, y1: bottom}),
  ].map((indices) => medianRgb({raster, indices}))
}

function stepsOut(input: {raster: Raster; box: Box; fill: Rgb; depth: number}): Rgb | null {
  const sides = edgeColor(input)
  const stepped = sides.every((color) => rgbDistance({a: color, b: input.fill}) > TOLERANCES.segmentDistance)
  return stepped ? (sides[0] ?? null) : null
}

function border(input: {raster: Raster; box: Box; fill: Rgb}): Border | null {
  const {raster, box, fill} = input
  const color = stepsOut({raster, box, fill, depth: 0})
  if (color === null) return null
  const width = Array.from({length: MAX_BORDER - 1}, (_, index) => index + 1).find(
    (depth) => stepsOut({raster, box, fill, depth}) === null,
  )
  return {width: width ?? MAX_BORDER, color: hex(color)}
}

function imageNode(box: Box): ImageNode {
  return {id: nodeId({kind: 'image', box}), kind: 'image', box}
}

type Measured = {fill: Rgb; dominant: number; cover: number; plain: boolean}

function measure(input: {level: Level; raw: Box}): Measured {
  const {level, raw} = input
  const {raster, background} = level
  const interior = boxIndices({raster, box: inset({box: raw, by: TOLERANCES.interiorInset})})
  const fill = medianRgb({raster, indices: interior})
  return {
    fill,
    dominant: share({raster, indices: interior, color: fill}),
    cover: inkCoverage({raster, box: raw, background, threshold: TOLERANCES.segmentDistance}),
    plain: rgbDistance({a: fill, b: background}) <= TOLERANCES.segmentDistance,
  }
}

function tooSparse(measured: Measured): boolean {
  const outline = measured.dominant >= OUTLINE_DOMINANT && measured.plain
  return measured.cover < FILLED && !outline
}

function boxNode(input: {level: Level; raw: Box; fill: Rgb; edge: Border | null}): Found[] {
  const {level, raw, fill, edge} = input
  const {raster, region, background, depth} = level
  const box = depth > 1 ? grow({raster, box: raw, region, fill}) : raw
  const node: BoxNode = {
    id: nodeId({kind: 'box', box}),
    kind: 'box',
    box,
    border: edge,
    radius: cornerRadius({raster, box, inside: fill, outside: background}),
  }
  const inner = inset({box, by: CHILD_INSET})
  return [node, ...children({raster, region: inner, background: fill, depth: depth + 1, text: level.text})]
}

function classify(input: {level: Level; raw: Box; rectangular: boolean}): Found[] {
  const {level, raw, rectangular} = input
  const wide = raw.w >= LARGE_SIDE && raw.h >= LARGE_SIDE
  if (!rectangular) return wide ? [imageNode(raw)] : []
  const measured = measure({level, raw})
  if (tooSparse(measured)) return wide && measured.dominant < DOMINANT ? [imageNode(raw)] : []
  const edge = border({raster: level.raster, box: raw, fill: measured.fill})
  if (measured.dominant < DOMINANT && edge === null) return [imageNode(raw)]
  return boxNode({level, raw, fill: measured.fill, edge})
}

function children(level: Level): Found[] {
  const {region, depth} = level
  if (depth > MAX_DEPTH || !large(region)) return []
  const {labels, regions} = candidates(level)
  return regions.flatMap((found) => {
    const raw = {x: found.box.x + region.x, y: found.box.y + region.y, w: found.box.w, h: found.box.h}
    const rectangular = solidity({labels, width: region.w, region: found}) >= RECTANGULAR
    return classify({level, raw, rectangular})
  })
}

export const thresholdSegmenter: Segmenter = {
  name: 'threshold',
  segment: ({raster, nodes}) => {
    const page = {x: 0, y: 0, w: raster.width, h: raster.height}
    const background = medianRgb({raster, indices: borderIndices({width: raster.width, box: page})})
    const text = nodes.flatMap((node) =>
      node.kind === 'text' ? [expand({box: node.box, by: TOLERANCES.glyphHalo})] : [],
    )
    return Promise.resolve(children({raster, region: page, background, depth: 1, text}))
  },
}
