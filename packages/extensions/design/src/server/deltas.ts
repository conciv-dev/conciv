import {differenceCiede2000, parse} from 'culori'
import {memoize} from 'es-toolkit'
import {TOLERANCES} from '../shared/tolerances.js'
import type {Box, ColorMetric, DeltaKind, LiveStyles, Pair, Raster, Side} from '../shared/types.js'
import {boxMask, crop, edgeMap, medianColor, pixelHex} from './raster.js'

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

const FILL_PRECISION = 1000

function measureFill(side: Side): number | null {
  if (side.parent === null || side.parent.w <= 0) return null
  return Math.round((side.box.w / side.parent.w) * FILL_PRECISION) / FILL_PRECISION
}

const fill: DeltaKind = {
  kind: 'fill',
  measure: ({live, target}) => {
    const a = measureFill(live)
    const b = measureFill(target)
    if (a === null || b === null) return []
    if (Math.abs(a - b) <= TOLERANCES.fillDifference * Math.max(a, b)) return []
    return [{kind: 'fill', live: a, target: b}]
  },
}

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
    const a = live.styles.radius
    const b = target.styles.radius
    if (a === undefined || b === undefined || !insetDiffers({live: a, target: b})) return []
    return [{kind: 'radius', live: a, target: b}]
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
  fill,
  align,
  padding,
  fontSize,
  lineHeight,
  fontWeight,
  background,
  foreground,
  radius,
]

type From = 'live' | 'target'

function pickBox(input: {pair: Pair | null; from: From}): Box | null {
  if (input.pair === null) return null
  return input.from === 'live' ? input.pair.liveBox : input.pair.targetBox
}

function union(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  return {x, y, w: Math.max(...boxes.map(right)) - x, h: Math.max(...boxes.map(bottom)) - y}
}

function contentBox(input: {children: Pair[]; from: From}): Box | null {
  const {children, from} = input
  if (children.some((child) => child.targetBox === null)) return null
  return union(children.flatMap((pair) => pickBox({pair, from}) ?? []))
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
  if (from === 'target') return {background: fills.background, ...color}
  const {background: declared, color: _declared, ...rest} = pair.live.styles
  return {...rest, ...(isOpaqueHex(declared) ? {background: declared} : {}), ...color}
}

function neighbourBox(input: {pair: Pair; from: From; step: 'prev' | 'next'}): Box | null {
  const {pair, from, step} = input
  const near = pair[step]
  if (from === 'live' || near === null || near.targetBox !== null) return pickBox({pair: near, from})
  return neighbourBox({pair: near, from, step})
}

export function sideFrom(input: {
  pair: Pair
  from: From
  children: Pair[]
  page: Box
  raster: Raster
  color: ColorMetric
  glyphs: Box[]
}): Side | null {
  const {pair, from, children, page, raster, color, glyphs} = input
  const box = pickBox({pair, from})
  if (box === null) return null
  return {
    box,
    parent: pair.parent === null ? page : pickBox({pair: pair.parent, from}),
    prev: neighbourBox({pair, from, step: 'prev'}),
    next: neighbourBox({pair, from, step: 'next'}),
    axis: pair.live.axis,
    textBox: contentBox({children, from}),
    styles: sideStyles({pair, from, box, raster, color, glyphs}),
  }
}
