import {clamp, countBy, range} from 'es-toolkit'
import type {z} from 'zod'
import type {Box, DesignNode, Raster} from '../../shared/defs.js'
import {designConfig} from '../../shared/tolerances.js'
import {box as geometry} from '../../shared/box.js'
import {createPaint} from './paint.js'

export function segment(input: {raster: Raster; nodes: Item[]; config: DesignConfig}): {
  nodes: Item[]
  warnings: string[]
} {
  const {config} = input
  const raster: Pixels = {
    width: input.raster.width,
    height: input.raster.height,
    data: input.raster.pixels(),
    rgb: (index) => input.raster.rgb(index),
  }
  const paint = createPaint({raster: input.raster, config})
  const context: Context = {raster, tolerances: designConfig.tolerances, gradient: paint.gradient}
  const found = SEGMENTERS[config.segmenter]({...context, nodes: input.nodes})
  const nodes = pictured({...context, nodes: [...input.nodes, ...found].filter((node) => !glyphNoise({node, context}))})
  try {
    return {nodes: paint.fill(nodes), warnings: []}
  } catch (error: unknown) {
    return {nodes, warnings: [`color failed: ${error instanceof Error ? error.message : String(error)}`]}
  }
}

type DesignConfig = z.output<typeof designConfig>
type Tolerances = typeof designConfig.tolerances
type Rgb = [number, number, number]
type Pixels = {width: number; height: number; data: Uint8Array; rgb(index: number): Rgb}
type Bare<Node> = Node extends unknown ? Omit<Node, 'id' | 'hash' | 'children' | 'layout'> : never
type Item = Bare<DesignNode>
type BoxItem = Extract<Item, {kind: 'box'}>
type ImageItem = Extract<Item, {kind: 'image'}>
type Context = {raster: Pixels; tolerances: Tolerances; gradient(input: {box: Box; holes: Box[]}): boolean}
type MaskRegion = {label: number; box: Box}
type Found = BoxItem | ImageItem
type Level = Context & {region: Box; background: Rgb; depth: number; text: Box[]; marks: Box[]}
type Side = 'left' | 'top' | 'right' | 'bottom'
type Measured = {fill: Rgb; dominant: number; cover: number; plain: boolean}

const SEGMENTERS = {threshold: thresholdSegment} as const satisfies Record<
  DesignConfig['segmenter'],
  (input: Context & {nodes: Item[]}) => Found[]
>

const RECTANGULAR = 0.85
const FILLED = 0.6
const DOMINANT = 0.5
const OUTLINE_DOMINANT = 0.9
const LARGE_SIDE = 64
const CHILD_INSET = 2
const MAX_DEPTH = 6
const MAX_BORDER = 4
const SIDES: Side[] = ['left', 'top', 'right', 'bottom']
const DIAGONAL_SHARE = 1 - Math.SQRT1_2

function thresholdSegment(input: Context & {nodes: Item[]}): Found[] {
  const {raster, nodes, tolerances} = input
  const page = {x: 0, y: 0, w: raster.width, h: raster.height}
  const background = medianRgb({raster, indices: borderIndices({width: raster.width, box: page})})
  const haloed = (node: Item): Box => geometry.expand({box: node.box, by: tolerances.glyphHalo})
  const text = nodes.filter((node) => node.kind === 'text').map(haloed)
  const marks = nodes.filter((node) => node.kind !== 'box').map(haloed)
  return children({...input, region: page, background, depth: 1, text, marks})
}

function children(level: Level): Found[] {
  const {region, depth} = level
  if (depth > MAX_DEPTH || !large({box: region, level})) return []
  const {labels, regions} = candidates(level)
  return regions.flatMap((found) => {
    const raw = {x: found.box.x + region.x, y: found.box.y + region.y, w: found.box.w, h: found.box.h}
    const rectangular = solidity({labels, width: region.w, region: found}) >= RECTANGULAR
    return classify({level, raw, rectangular})
  })
}

function candidates(level: Level): {labels: Int32Array; regions: MaskRegion[]} {
  const {region} = level
  const local = {...region, x: 0, y: 0}
  const mask = threshold(level)
  const first = labelRegions({mask, width: region.w, height: region.h})
  const spanning = first.regions.some(
    (found) => large({box: found.box, level}) && spans({region: local, candidate: found.box}),
  )
  const labelled = spanning
    ? labelRegions({mask: openMask({mask, width: region.w, height: region.h}), width: region.w, height: region.h})
    : first
  const sized = labelled.regions.filter(
    (found) => large({box: found.box, level}) && !spans({region: local, candidate: found.box}),
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

function threshold(level: Level): Uint8Array {
  const {raster, region, background, tolerances} = level
  const mask = new Uint8Array(region.w * region.h)
  range(region.h).forEach((y) =>
    range(region.w).forEach((x) => {
      const pixel = raster.rgb((region.y + y) * raster.width + region.x + x)
      mask[y * region.w + x] = designConfig.rgbDistance({a: pixel, b: background}) > tolerances.segmentDistance ? 1 : 0
    }),
  )
  level.marks.forEach((glyphs) => {
    const area = geometry.intersection({a: glyphs, b: region})
    if (area === null) return
    const local = {x: area.x - region.x, y: area.y - region.y, w: area.w, h: area.h}
    const ring = borderIndices({width: region.w, box: local})
    const on = ring.filter((index) => mask[index] === 1).length
    const value = on * 2 >= ring.length ? 1 : 0
    range(local.y, local.y + local.h).forEach((y) =>
      mask.fill(value, y * region.w + local.x, y * region.w + local.x + local.w),
    )
  })
  return mask
}

function labelRegions(input: {mask: Uint8Array; width: number; height: number}): {
  labels: Int32Array
  regions: MaskRegion[]
} {
  const {mask, width, height} = input
  const labels = new Int32Array(width * height)
  const regions: MaskRegion[] = []
  range(height).forEach((y) =>
    range(width).forEach((x) => {
      const start = y * width + x
      if (mask[start] !== 1 || labels[start] !== 0) return
      labels[start] = regions.length + 1
      regions.push(floodFill({mask, labels, width, height, start}))
    }),
  )
  return {labels, regions}
}

function floodFill(input: {
  mask: Uint8Array
  labels: Int32Array
  width: number
  height: number
  start: number
}): MaskRegion {
  const {mask, labels, width, height, start} = input
  const label = labels[start] ?? 0
  const bounds = {minX: width, minY: height, maxX: 0, maxY: 0}
  const stack = [start]
  while (stack.length > 0) {
    const index = stack.pop() ?? 0
    const x = index % width
    const y = (index - x) / width
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
    box: {x: bounds.minX, y: bounds.minY, w: bounds.maxX - bounds.minX + 1, h: bounds.maxY - bounds.minY + 1},
  }
}

function openMask(input: {mask: Uint8Array; width: number; height: number}): Uint8Array {
  const {mask, width, height} = input
  const offsets = range(-1, 2).flatMap((dy) => range(-1, 2).map((dx) => ({dx, dy})))
  const pass = (source: Uint8Array, keep: (count: number) => boolean): Uint8Array => {
    const out = new Uint8Array(source.length)
    range(height).forEach((y) =>
      range(width).forEach((x) => {
        const count = offsets.reduce((sum, {dx, dy}) => {
          const nx = Math.min(width - 1, Math.max(0, x + dx))
          const ny = Math.min(height - 1, Math.max(0, y + dy))
          return sum + (source[ny * width + nx] ?? 0)
        }, 0)
        out[y * width + x] = keep(count) ? 1 : 0
      }),
    )
    return out
  }
  return pass(
    pass(mask, (count) => count === offsets.length),
    (count) => count > 0,
  )
}

function solidity(input: {labels: Int32Array; width: number; region: MaskRegion}): number {
  const {labels, width, region} = input
  const {box, label} = region
  const filled = range(box.y, box.y + box.h).reduce((sum, y) => {
    const hits = range(box.x, box.x + box.w).filter((x) => labels[y * width + x] === label)
    const first = hits[0]
    const last = hits.at(-1)
    return first === undefined || last === undefined ? sum : sum + last - first + 1
  }, 0)
  return filled / (box.w * box.h)
}

function classify(input: {level: Level; raw: Box; rectangular: boolean}): Found[] {
  const {level, raw, rectangular} = input
  const wide = raw.w >= LARGE_SIDE && raw.h >= LARGE_SIDE
  if (!rectangular) return wide ? [imageItem(raw)] : []
  const measured = measure({level, raw})
  if (tooSparse(measured)) return wide && measured.dominant < DOMINANT ? [imageItem(raw)] : []
  const edge = border({level, box: raw, fill: measured.fill})
  const gradient = measured.dominant < DOMINANT && gradientFill({level, raw})
  if (measured.dominant < DOMINANT && edge === null && !gradient) return [imageItem(raw)]
  return boxItem({level, raw, fill: measured.fill, edge, gradient})
}

function measure(input: {level: Level; raw: Box}): Measured {
  const {level, raw} = input
  const {raster, background, tolerances} = level
  const interior = boxIndices({raster, box: geometry.inset({box: raw, by: tolerances.interiorInset})})
  const fill = medianRgb({raster, indices: interior})
  const all = boxIndices({raster, box: raw})
  const covered = all.filter(
    (index) => designConfig.rgbDistance({a: raster.rgb(index), b: background}) > tolerances.segmentDistance,
  ).length
  return {
    fill,
    dominant: share({level, indices: interior, color: fill}),
    cover: all.length === 0 ? 0 : covered / all.length,
    plain: designConfig.rgbDistance({a: fill, b: background}) <= tolerances.segmentDistance,
  }
}

function tooSparse(measured: Measured): boolean {
  const outline = measured.dominant >= OUTLINE_DOMINANT && measured.plain
  return measured.cover < FILLED && !outline
}

function gradientFill(input: {level: Level; raw: Box}): boolean {
  const {level, raw} = input
  const holes = level.text.filter((box) => geometry.overlaps({a: box, b: raw}))
  const box = geometry.inset({box: raw, by: level.tolerances.interiorInset})
  return level.gradient({box, holes})
}

function boxItem(input: {level: Level; raw: Box; fill: Rgb; edge: BoxItem['border']; gradient: boolean}): Found[] {
  const {level, raw, fill, edge, gradient} = input
  const {raster, background, depth, tolerances} = level
  const box = depth > 1 ? grow({level, box: raw, fill}) : raw
  const node: BoxItem = {
    kind: 'box',
    box,
    border: edge,
    radius: cornerRadius({raster, box, inside: fill, outside: background, tolerances}),
  }
  const inner = geometry.inset({box, by: CHILD_INSET})
  const found = gradient ? [] : children({...level, region: inner, background: fill, depth: depth + 1})
  const empty =
    !found.some((child) => child.kind === 'box') && !level.text.some((text) => geometry.overlaps({a: box, b: text}))
  if (empty && box.w < tolerances.iconSlotSide && box.h < tolerances.iconSlotSide) return [imageItem(box), ...found]
  return [node, ...found]
}

function grow(input: {level: Level; box: Box; fill: Rgb}): Box {
  const {level, fill} = input
  const {raster, region} = level
  const steps = Array.from({length: CHILD_INSET}, () => SIDES).flat()
  return steps.reduce((box, side) => {
    if (!reaches({raster, box, region, side})) return box
    const fits = share({level, indices: outside({raster, box, side}), color: fill}) >= DOMINANT
    return fits ? widened({box, side}) : box
  }, input.box)
}

function reaches(input: {raster: Pixels; box: Box; region: Box; side: Side}): boolean {
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

function outside(input: {raster: Pixels; box: Box; side: Side}): number[] {
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

function border(input: {level: Level; box: Box; fill: Rgb}): BoxItem['border'] {
  const color = stepsOut({...input, depth: 0})
  if (color === null) return null
  const width = range(1, MAX_BORDER).find((depth) => stepsOut({...input, depth}) === null)
  return {width: width ?? MAX_BORDER, color: designConfig.hex(color)}
}

function stepsOut(input: {level: Level; box: Box; fill: Rgb; depth: number}): Rgb | null {
  const {level, box, fill, depth} = input
  const {raster} = level
  const right = box.x + box.w
  const bottom = box.y + box.h
  const sides = [
    rowIndices({width: raster.width, y: box.y + depth, x0: box.x, x1: right}),
    rowIndices({width: raster.width, y: bottom - 1 - depth, x0: box.x, x1: right}),
    columnIndices({width: raster.width, x: box.x + depth, y0: box.y, y1: bottom}),
    columnIndices({width: raster.width, x: right - 1 - depth, y0: box.y, y1: bottom}),
  ].map((indices) => medianRgb({raster, indices}))
  const stepped = sides.every(
    (color) => designConfig.rgbDistance({a: color, b: fill}) > level.tolerances.segmentDistance,
  )
  return stepped ? (sides[0] ?? null) : null
}

function cornerRadius(input: {raster: Pixels; box: Box; inside: Rgb; outside: Rgb; tolerances: Tolerances}): number {
  const {box} = input
  const limit = Math.floor(Math.min(box.w, box.h) / 2)
  const right = box.x + box.w - 1
  const bottom = box.y + box.h - 1
  const corners = [
    {corner: {x: box.x, y: box.y}, step: {x: 1, y: 1}},
    {corner: {x: right, y: box.y}, step: {x: -1, y: 1}},
    {corner: {x: box.x, y: bottom}, step: {x: 1, y: -1}},
    {corner: {x: right, y: bottom}, step: {x: -1, y: -1}},
  ]
  const depths = corners.map((corner) => cornerDepth({...input, ...corner, limit})).toSorted((a, b) => a - b)
  return Math.round(((depths[1] ?? 0) + (depths[2] ?? 0)) / 2 / DIAGONAL_SHARE)
}

function cornerDepth(input: {
  raster: Pixels
  box: Box
  corner: {x: number; y: number}
  step: {x: number; y: number}
  inside: Rgb
  outside: Rgb
  limit: number
  tolerances: Tolerances
}): number {
  const {raster, corner, step, outside: beyond, limit} = input
  return range(limit).reduce(
    (walked, i) => {
      if (walked.done) return walked
      const x = corner.x + step.x * i
      const y = corner.y + step.y * i
      const span = designConfig.rgbDistance({a: fillAt({...input, x, y}), b: beyond})
      if (span === 0) return {depth: walked.depth, done: true}
      const covered = Math.min(1, designConfig.rgbDistance({a: raster.rgb(y * raster.width + x), b: beyond}) / span)
      return {depth: walked.depth + 1 - covered, done: covered >= 1}
    },
    {depth: 0, done: false},
  ).depth
}

function fillAt(input: {raster: Pixels; box: Box; x: number; y: number; inside: Rgb; tolerances: Tolerances}): Rgb {
  const {raster, box, x, y, inside} = input
  const margin = input.tolerances.interiorInset
  if (box.w <= margin * 2 || box.h <= margin * 2) return inside
  const at = {
    x: clamp(x, box.x + margin, box.x + box.w - margin - 1),
    y: clamp(y, box.y + margin, box.y + box.h - margin - 1),
  }
  const column = medianRgb({
    raster,
    indices: range(box.y + margin, box.y + box.h - margin).map((row) => row * raster.width + at.x),
  })
  const row = medianRgb({
    raster,
    indices: range(box.x + margin, box.x + box.w - margin).map((across) => at.y * raster.width + across),
  })
  const channel = (c: 0 | 1 | 2): number => Math.min(255, Math.max(0, column[c] + row[c] - inside[c]))
  return [channel(0), channel(1), channel(2)]
}

function imageItem(box: Box): ImageItem {
  return {kind: 'image', box, holds: 0}
}

function glyphNoise(input: {node: Item; context: Context}): boolean {
  const {node, context} = input
  const side = context.tolerances.glyphNoise
  return node.kind === 'image' && node.box.w < side && node.box.h < side
}

function pictured(input: Context & {nodes: Item[]}): Item[] {
  const {nodes, raster, tolerances} = input
  const side = tolerances.iconSlotSide
  const pictures = nodes
    .filter((node) => node.kind === 'image' && node.box.w >= side && node.box.h >= side)
    .toSorted((a, b) => geometry.area(a.box) - geometry.area(b.box))
  const ownerOf = (node: Item): number => {
    if (node.kind !== 'text') return -1
    const image = pictures.find((candidate) => geometry.encloses({outer: candidate.box, inner: node.box}))
    if (image === undefined || flatHalo({node, nodes, raster, tolerances, gradient: input.gradient})) return -1
    return nodes.indexOf(image)
  }
  const owners = nodes.map((node) => ({node, owner: ownerOf(node)}))
  const held = countBy(owners, ({owner}) => String(owner))
  return owners.flatMap(({node, owner}, index): Item[] => {
    if (owner !== -1) return []
    if (node.kind !== 'image') return [node]
    return [{...node, holds: held[String(index)] ?? 0}]
  })
}

function flatHalo(input: Context & {node: Item; nodes: Item[]}): boolean {
  const {node, nodes, raster, tolerances} = input
  const band = geometry.expand({box: node.box, by: tolerances.glyphHalo})
  const others = nodes.filter(
    (other) =>
      other !== node &&
      geometry.overlaps({a: other.box, b: band}) &&
      !geometry.encloses({outer: other.box, inner: node.box}),
  )
  const area = geometry.clip({width: raster.width, height: raster.height, box: node.box, margin: tolerances.glyphHalo})
  const covered = [node.box, ...others.map((other) => other.box)].map((box) =>
    geometry.clip({width: raster.width, height: raster.height, box, margin: 0}),
  )
  const indices = range(area.y, area.y + area.h).flatMap((y) =>
    range(area.x, area.x + area.w).flatMap((x) =>
      covered.some((box) => x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h)
        ? []
        : [y * raster.width + x],
    ),
  )
  if (indices.length === 0) return false
  return share({level: input, indices, color: medianRgb({raster, indices})}) >= OUTLINE_DOMINANT
}

function share(input: {level: Context; indices: number[]; color: Rgb}): number {
  const {level, indices, color} = input
  if (indices.length === 0) return 0
  const close = indices.filter(
    (index) => designConfig.rgbDistance({a: level.raster.rgb(index), b: color}) <= level.tolerances.segmentDistance,
  ).length
  return close / indices.length
}

function medianRgb(input: {raster: Pixels; indices: number[]}): Rgb {
  const {raster, indices} = input
  const channel = (offset: number): number => {
    const sorted = indices.map((index) => raster.data[index * 4 + offset] ?? 0).toSorted((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)] ?? 0
  }
  return [channel(0), channel(1), channel(2)]
}

function boxIndices(input: {raster: Pixels; box: Box}): number[] {
  const {raster, box} = input
  return range(box.y, box.y + box.h).flatMap((y) => rowIndices({width: raster.width, y, x0: box.x, x1: box.x + box.w}))
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

function spans(input: {region: Box; candidate: Box}): boolean {
  const {region, candidate} = input
  return candidate.w >= region.w - 2 && candidate.h >= region.h - 2
}

function large(input: {box: Box; level: Context}): boolean {
  const side = input.level.tolerances.unmatchedMinimum
  return input.box.w >= side && input.box.h >= side
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
