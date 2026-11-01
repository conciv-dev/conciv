import type {Box, ColorMetric, DeltaKind, LiveStyles, Pair, Raster, Side} from '../shared/types.js'
import {background, foreground, isOpaqueHex, sampledFills} from './deltas/colors.js'
import {align, fill} from './deltas/fill-align.js'
import {gapAfter, gapBefore} from './deltas/gaps.js'
import {bottom, insetBottom, insetLeft, insetRight, insetTop, right} from './deltas/insets.js'
import {padding} from './deltas/padding.js'
import {radius} from './deltas/radius.js'
import {fontSize, fontWeight, lineHeight} from './deltas/typography.js'

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
}): Partial<LiveStyles> {
  const {pair, from, box, raster} = input
  const textLeaf = pair.live.children.length === 0 && pair.live.text !== ''
  const fills = sampledFills({raster, box, glyphs: [box], color: input.color})
  const color = textLeaf && fills.foreground !== null ? {color: fills.foreground} : {}
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
}): Side | null {
  const {pair, from, children, page, raster, color} = input
  const box = pickBox({pair, from})
  if (box === null) return null
  return {
    box,
    parent: pair.parent === null ? page : pickBox({pair: pair.parent, from}),
    prev: neighbourBox({pair, from, step: 'prev'}),
    next: neighbourBox({pair, from, step: 'next'}),
    axis: pair.live.axis,
    textBox: contentBox({children, from}),
    styles: sideStyles({pair, from, box, raster, color}),
  }
}
