import {differenceCiede2000, parse} from 'culori'
import {memoize} from 'es-toolkit'
import {TOLERANCES} from '../shared/tolerances.js'
import type {Box, ColorMetric, DeltaKind, Flow, LiveBorder, LiveStyles, Pair, Raster, Side} from '../shared/types.js'
import {boxMask, cornerRadius, crop, edgeMap, medianColor, pixelHex, type Rgb} from './raster.js'

const difference = differenceCiede2000()

const ciede2000: ColorMetric = {
  name: 'ciede2000',
  distance: ({a, b}) => {
    const from = parse(a)
    const to = parse(b)
    if (from === undefined || to === undefined) return 0
    return difference(from, to)
  },
}

export const COLOR_METRICS = {ciede2000} as const satisfies Record<string, ColorMetric>

const OPAQUE_HEX_LENGTH = 7

export function isOpaqueHex(color: string): boolean {
  return color.startsWith('#') && color.length === OPAQUE_HEX_LENGTH
}

export function glyphCoreColor(input: {
  raster: Raster
  box: Box
  glyphs: Box[]
  background: string
  color: ColorMetric
}): string | null {
  const {raster, box, glyphs, background, color} = input
  const tile = crop({raster, box})
  const inGlyph = boxMask({boxes: glyphs, area: tile.box})
  const distance = memoize((hex: string) => color.distance({a: hex, b: background}))
  const distances = Array.from(inGlyph, (inside, index) =>
    inside === 1 ? distance(pixelHex({raster: tile.raster, index})) : 0,
  )
  const peak = distances.reduce((highest, value) => Math.max(highest, value), 0)
  if (peak <= TOLERANCES.colorDeltaE) return null
  const core = Uint8Array.from(distances, (value) => (value >= peak - TOLERANCES.colorDeltaE ? 1 : 0))
  return medianColor({raster: tile.raster, exclude: core.map((value) => 1 - value)})
}

export function sampledFills(input: {raster: Raster; box: Box; glyphs: Box[]; color: ColorMetric}): {
  background: string
  foreground: string | null
} {
  const {raster, box, glyphs, color} = input
  const tile = crop({raster, box}).raster
  const background = medianColor({raster: tile, exclude: edgeMap(tile)})
  return {background, foreground: glyphCoreColor({raster, box, glyphs, background, color})}
}

function colorKind(input: {kind: 'background' | 'foreground'; tolerance: number}): DeltaKind {
  const {kind, tolerance} = input
  const key = kind === 'background' ? 'background' : 'color'
  return {
    kind,
    measure: ({live, target, color}) => {
      const a = live.styles[key]
      const b = target.styles[key]
      if (a === undefined || b === undefined || color.distance({a, b}) <= tolerance) return []
      return [{kind, live: a, target: b}]
    },
  }
}

const background = colorKind({kind: 'background', tolerance: TOLERANCES.declaredColorDeltaE})
const foreground = colorKind({kind: 'foreground', tolerance: TOLERANCES.colorDeltaE})

type Insets = {left: number; right: number; top: number; bottom: number}

function measureInsets(side: Side): Insets | null {
  const {box, textBox} = side
  if (textBox === null) return null
  return {
    left: Math.round(textBox.x - box.x),
    right: Math.round(box.x + box.w - (textBox.x + textBox.w)),
    top: Math.round(textBox.y - box.y),
    bottom: Math.round(box.y + box.h - (textBox.y + textBox.h)),
  }
}

function insetDiffers(input: {live: number; target: number}): boolean {
  return Math.abs(input.live - input.target) > TOLERANCES.geometryPx
}

function insetKind(edge: keyof Insets): DeltaKind {
  const kind = `inset-${edge}` as const
  return {
    kind,
    measure: ({live, target}) => {
      const a = measureInsets(live)
      const b = measureInsets(target)
      if (a === null || b === null || !insetDiffers({live: a[edge], target: b[edge]})) return []
      return [{kind, live: a[edge], target: b[edge]}]
    },
  }
}

function right(box: Box): number {
  return box.x + box.w
}

function bottom(box: Box): number {
  return box.y + box.h
}

const insetLeft = insetKind('left')
const insetRight = insetKind('right')
const insetTop = insetKind('top')
const insetBottom = insetKind('bottom')

function gapBetween(input: {first: Box; second: Box; axis: 'row' | 'column'}): number {
  const {first, second, axis} = input
  return Math.round(axis === 'row' ? second.x - right(first) : second.y - bottom(first))
}

function measureGap(input: {side: Side; before: boolean}): number | null {
  const {side, before} = input
  if (side.axis === null) return null
  const other = before ? side.prev : side.next
  if (other === null) return null
  if (before) return gapBetween({first: other, second: side.box, axis: side.axis})
  return gapBetween({first: side.box, second: other, axis: side.axis})
}

function gapKind(before: boolean): DeltaKind {
  const kind = before ? 'gap-before' : 'gap-after'
  return {
    kind,
    measure: ({live, target}) => {
      const a = measureGap({side: live, before})
      const b = measureGap({side: target, before})
      if (a === null || b === null || !insetDiffers({live: a, target: b})) return []
      return [{kind, live: a, target: b}]
    },
  }
}

const gapBefore = gapKind(true)
const gapAfter = gapKind(false)

function classifyAlign(side: Side): string | null {
  const insets = measureInsets(side)
  if (insets === null) return null
  const near = (value: number): boolean => Math.abs(value) <= TOLERANCES.geometryPx
  if (near(insets.left) && near(insets.right)) return 'stretch'
  if (near(insets.left - insets.right)) return 'center'
  if (near(insets.left)) return 'left'
  if (near(insets.right)) return 'right'
  return null
}

const align: DeltaKind = {
  kind: 'align',
  measure: ({live, target}) => {
    const a = classifyAlign(live)
    const b = classifyAlign(target)
    if (a === null || b === null || a === b) return []
    return [{kind: 'align', live: a, target: b}]
  },
}

function measurePadding(side: Side): {x: number; y: number} | null {
  if (side.styles.fontSize === undefined) return null
  const insets = measureInsets(side)
  if (insets === null) return null
  return {x: Math.round((insets.left + insets.right) / 2), y: Math.round((insets.top + insets.bottom) / 2)}
}

const padding: DeltaKind = {
  kind: 'padding',
  measure: ({live, target}) => {
    const a = measurePadding(live)
    const b = measurePadding(target)
    if (a === null || b === null) return []
    return (['x', 'y'] as const).flatMap((side) =>
      insetDiffers({live: a[side], target: b[side]})
        ? [{kind: 'padding' as const, side, live: a[side], target: b[side]}]
        : [],
    )
  },
}

const radius: DeltaKind = {
  kind: 'radius',
  measure: ({live, target}) => {
    const a = live.radius
    const b = target.radius
    if (a === null || b === null || !insetDiffers({live: a, target: b})) return []
    return [{kind: 'radius', live: a, target: b}]
  },
}

const border: DeltaKind = {
  kind: 'border',
  measure: ({live, target, color}) => {
    const declared = live.styles.border
    if (declared === undefined || live.edge === null || target.edge === null) return []
    if (color.distance({a: live.edge, b: target.edge}) <= TOLERANCES.colorDeltaE) return []
    return [{kind: 'border', side: declared.side, live: declared.color, target: target.edge}]
  },
}

const axis: DeltaKind = {
  kind: 'axis',
  measure: ({live, target}) => {
    if (live.flow === null || target.flow === null || live.flow === target.flow) return []
    return [{kind: 'axis', live: live.flow, target: target.flow}]
  },
}

const columns: DeltaKind = {
  kind: 'columns',
  measure: ({live, target}) => {
    if (live.columns === null || target.columns === null || live.columns === target.columns) return []
    return [{kind: 'columns', live: live.columns, target: target.columns}]
  },
}

const SIZE_TOLERANCE = 0.5

function typographyKind(input: {kind: 'fontSize' | 'lineHeight' | 'fontWeight'; tolerance: number}): DeltaKind {
  const {kind, tolerance} = input
  const key: keyof LiveStyles = kind
  return {
    kind,
    measure: ({live, target}) => {
      const a = live.styles[key]
      const b = target.styles[key]
      if (typeof a !== 'number' || typeof b !== 'number' || Math.abs(a - b) <= tolerance) return []
      return [{kind, live: a, target: b}]
    },
  }
}

const fontSize = typographyKind({kind: 'fontSize', tolerance: SIZE_TOLERANCE})
const lineHeight = typographyKind({kind: 'lineHeight', tolerance: SIZE_TOLERANCE})
const fontWeight = typographyKind({kind: 'fontWeight', tolerance: 0})

export const DELTA_KINDS: DeltaKind[] = [
  insetLeft,
  insetRight,
  insetTop,
  insetBottom,
  gapBefore,
  gapAfter,
  align,
  padding,
  fontSize,
  lineHeight,
  fontWeight,
  background,
  foreground,
  radius,
  border,
  axis,
  columns,
]

type From = 'live' | 'target'

export function sideFrom(input: {
  pair: Pair
  from: From
  children: Pair[]
  leaves: Pair[]
  page: Box
  raster: Raster
  color: ColorMetric
  glyphs: Box[]
  window: Box
  strip: Box | null
}): Side {
  const {pair, from, children, leaves, page, raster, color, glyphs, window, strip} = input
  const box = pickBox({pair, from})
  return {
    box,
    parent: pair.parent === null ? page : pickBox({pair: pair.parent, from}),
    prev: pair.prev === null ? null : pickBox({pair: pair.prev, from}),
    next: pair.next === null ? null : pickBox({pair: pair.next, from}),
    axis: pair.live.axis,
    flow: pair.next === null ? null : flowBetween({a: box, b: pickBox({pair: pair.next, from})}),
    columns: columnCount({pair, from, leaves}),
    textBox: contentBox({children, from}),
    edge:
      strip === null
        ? null
        : medianColor({raster: crop({raster, box: strip}).raster, exclude: new Uint8Array(strip.w * strip.h)}),
    radius: paintedRadius({raster, box: window}),
    styles: sideStyles({pair, from, box, raster, color, glyphs}),
  }
}

export function edgeStrip(input: {
  pair: Pair
  raster: Raster
  color: ColorMetric
  shift: {dx: number; dy: number}
  toward: 'declared' | 'contrast'
}): Box | null {
  const {pair, raster, color, shift, toward} = input
  const declared = pair.live.styles.border
  if (declared.width <= 0 || declared.style === 'none' || declared.style === 'hidden') return null
  const box = {...pair.liveBox, x: pair.liveBox.x + shift.dx, y: pair.liveBox.y + shift.dy}
  const strips = EDGE_OFFSETS.flatMap(
    (offset) => stripAt({box, side: declared.side, width: declared.width, offset}) ?? [],
  )
  const inside = sampledFills({raster, box, glyphs: [box], color}).background
  const scored = strips.map((strip) => {
    const seen = medianColor({raster: crop({raster, box: strip}).raster, exclude: new Uint8Array(strip.w * strip.h)})
    const score =
      toward === 'declared' ? -color.distance({a: seen, b: declared.color}) : color.distance({a: seen, b: inside})
    return {strip, score}
  })
  const best = scored.reduce<{strip: Box; score: number} | null>(
    (found, entry) => (found === null || entry.score > found.score ? entry : found),
    null,
  )
  return best?.strip ?? null
}

const EDGE_OFFSETS = [-1, 0, 1]
const CORNER_INSET = 2
const FLOW_BAND = 1

function stripAt(input: {box: Box; side: LiveBorder['side']; width: number; offset: number}): Box | null {
  const {box, side, offset} = input
  const width = Math.max(1, Math.round(input.width))
  const inset = Math.max(CORNER_INSET, width)
  if (box.w <= inset * 2 || box.h <= inset * 2) return null
  switch (side) {
    case 'top':
      return {x: box.x + inset, y: box.y - offset, w: box.w - inset * 2, h: width}
    case 'bottom':
      return {x: box.x + inset, y: box.y + box.h - width + offset, w: box.w - inset * 2, h: width}
    case 'left':
      return {x: box.x - offset, y: box.y + inset, w: width, h: box.h - inset * 2}
    case 'right':
      return {x: box.x + box.w - width + offset, y: box.y + inset, w: width, h: box.h - inset * 2}
  }
}

function pickBox(input: {pair: Pair; from: From}): Box {
  return input.from === 'live' ? input.pair.liveBox : input.pair.targetBox
}

function flowBetween(input: {a: Box; b: Box}): Flow {
  const dx = Math.abs(input.b.x + input.b.w / 2 - (input.a.x + input.a.w / 2))
  const dy = Math.abs(input.b.y + input.b.h / 2 - (input.a.y + input.a.h / 2))
  return dx > dy ? 'row' : 'column'
}

function columnCount(input: {pair: Pair; from: From; leaves: Pair[]}): number | null {
  const {pair, from, leaves} = input
  if (pair.live.columns === null) return null
  if (from === 'live') return pair.live.columns
  const spans = leaves.map((leaf) => leaf.node.box).toSorted((a, b) => a.x - b.x)
  const bands = spans.reduce<{end: number; count: number}>(
    (state, box) =>
      box.x >= state.end - FLOW_BAND
        ? {end: box.x + box.w, count: state.count + 1}
        : {end: Math.max(state.end, box.x + box.w), count: state.count},
    {end: Number.NEGATIVE_INFINITY, count: 0},
  )
  return bands.count === 0 ? null : bands.count
}

function union(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  return {x, y, w: Math.max(...boxes.map(right)) - x, h: Math.max(...boxes.map(bottom)) - y}
}

function contentBox(input: {children: Pair[]; from: From}): Box | null {
  const {children, from} = input
  return union(children.map((pair) => pickBox({pair, from})))
}

function paintedRadius(input: {raster: Raster; box: Box}): number | null {
  const {raster} = input
  const box = {
    x: Math.round(input.box.x),
    y: Math.round(input.box.y),
    w: Math.round(input.box.w),
    h: Math.round(input.box.h),
  }
  const ring = {x: box.x - 1, y: box.y - 1, w: box.w + 2, h: box.h + 2}
  if (box.w < TOLERANCES.interiorInset * 4 || box.h < TOLERANCES.interiorInset * 4) return null
  if (ring.x < 0 || ring.y < 0 || ring.x + ring.w > raster.width || ring.y + ring.h > raster.height) return null
  const interior = crop({
    raster,
    box: {
      x: box.x + TOLERANCES.interiorInset,
      y: box.y + TOLERANCES.interiorInset,
      w: box.w - TOLERANCES.interiorInset * 2,
      h: box.h - TOLERANCES.interiorInset * 2,
    },
  }).raster
  const around = crop({raster, box: ring}).raster
  const inside = toRgb(medianColor({raster: interior, exclude: edgeMap(interior)}))
  const outside = toRgb(
    medianColor({
      raster: around,
      exclude: boxMask({boxes: [{x: 1, y: 1, w: box.w, h: box.h}], area: {x: 0, y: 0, w: ring.w, h: ring.h}}),
    }),
  )
  return cornerRadius({raster, box, inside, outside})
}

function toRgb(color: string): Rgb {
  const value = Number.parseInt(color.slice(1, OPAQUE_HEX_LENGTH), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

function sideStyles(input: {
  pair: Pair
  from: From
  box: Box
  raster: Raster
  color: ColorMetric
  glyphs: Box[]
}): Partial<LiveStyles> {
  const {pair, from, box, raster} = input
  const paintsText = pair.live.glyphs.length > 0
  const glyphs = input.glyphs.length === 0 ? [box] : input.glyphs
  const fills = sampledFills({raster, box, glyphs, color: input.color})
  const color = paintsText && fills.foreground !== null ? {color: fills.foreground} : {}
  if (from === 'target') {
    const painted =
      pair.node.kind === 'box' && pair.node.paint !== undefined ? pair.node.paint.background : fills.background
    return {background: painted, ...color, ...estimatedType(pair)}
  }
  const {background: declared, color: _declared, ...rest} = pair.live.styles
  return {...rest, ...(isOpaqueHex(declared) ? {background: declared} : {}), ...color}
}

function estimatedType(pair: Pair): Partial<LiveStyles> {
  const typography = pair.texts.find((text) => text.typography !== undefined)?.typography
  if (typography === undefined) return {}
  return {fontSize: typography.size, lineHeight: typography.lineHeight, fontWeight: typography.weight}
}
