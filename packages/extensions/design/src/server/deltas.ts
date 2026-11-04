import {differenceCiede2000, parse} from 'culori'
import {minBy} from 'es-toolkit'
import type {NodeLayout} from '../shared/defs.js'
import {leadingFamily, sameFamily, TOLERANCES} from '../shared/tolerances.js'
import type {
  Box,
  ColorMetric,
  Delta,
  DeltaKind,
  Flow,
  Gradient,
  LiveBorder,
  LiveComponent,
  LiveStyles,
  Pair,
  Raster,
  Side,
  TargetNode,
} from '../shared/types.js'
import {boxMask, coreColor, crop, edgeMap, hex, medianColor} from './raster.js'

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
  const known = new Map<number, number>()
  const distance = (rgb: number): number => {
    const seen = known.get(rgb)
    if (seen !== undefined) return seen
    const measured = color.distance({a: hex([(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff]), b: background})
    known.set(rgb, measured)
    return measured
  }
  return coreColor({raster: tile.raster, inside: inGlyph, distance, spread: TOLERANCES.colorDeltaE})
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

const solidBackground = colorKind({kind: 'background', tolerance: TOLERANCES.declaredColorDeltaE})

const background: DeltaKind = {
  kind: 'background',
  measure: (input) => {
    const {live, target, color} = input
    const design = target.styles.gradient
    const shown = live.styles.gradient
    if (design !== null && design !== undefined) return gradientDeltas({design, live, color})
    if (shown === null || shown === undefined || live.styles.background !== undefined) {
      return solidBackground.measure(input)
    }
    return solidBackground.measure({...input, live: {...live, styles: {...live.styles, background: shown.from}}})
  },
}

function gradientDeltas(input: {design: Gradient; live: Side; color: ColorMetric}): Delta[] {
  const {design, live, color} = input
  const target = `gradient ${design.from} to ${design.to}`
  const shown = live.styles.gradient
  if (shown === null || shown === undefined) {
    const solid = live.styles.background
    return solid === undefined ? [] : [{kind: 'background', live: solid, target}]
  }
  const ends = [
    {a: shown.from, b: design.from},
    {a: shown.to, b: design.to},
  ]
  if (ends.every((end) => color.distance(end) <= TOLERANCES.colorDeltaE)) return []
  return [{kind: 'background', live: `gradient ${shown.from} to ${shown.to}`, target}]
}
const foreground = colorKind({kind: 'foreground', tolerance: TOLERANCES.colorDeltaE})

type Insets = {left: number; right: number; top: number; bottom: number}

function measureInsets(side: Side): Insets | null {
  const {box, textBox, padding} = side
  if (padding !== null) return padding
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
  const read = (side: Side): number | null => measureInsets(side)?.[edge] ?? null
  return {
    kind,
    read,
    measure: ({live, target}) => {
      const a = read(live)
      const b = read(target)
      if (a === null || b === null || !insetDiffers({live: a, target: b})) return []
      return [{kind, live: a, target: b}]
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
  const read = (side: Side): number | null => measureGap({side, before})
  return {
    kind,
    read,
    measure: ({live, target}) => {
      const a = read(live)
      const b = read(target)
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
  read: classifyAlign,
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

function sizeKind(input: {kind: 'width' | 'height'; key: 'w' | 'h'}): DeltaKind {
  const {kind, key} = input
  const read = (side: Side): number => Math.round(side.box[key])
  return {
    kind,
    read,
    measure: ({live, target}) => {
      if (target.kind === 'text') return []
      const a = read(live)
      const b = read(target)
      if (!insetDiffers({live: a, target: b})) return []
      return [{kind, live: a, target: b}]
    },
  }
}

const boxWidth = sizeKind({kind: 'width', key: 'w'})
const boxHeight = sizeKind({kind: 'height', key: 'h'})

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

const sizing: DeltaKind = {
  kind: 'sizing',
  measure: ({live, target}) => {
    if (live.size !== 'fixed' || (target.size !== 'fill' && target.size !== 'fit')) return []
    return [{kind: 'sizing', live: 'fixed', target: target.size}]
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

const font: DeltaKind = {
  kind: 'font',
  measure: ({live, target}) => {
    const a = live.styles.fontFamily
    const b = target.styles.fontFamily
    if (a === undefined || b === undefined || sameFamily({a, b})) return []
    return [{kind: 'font', live: leadingFamily(a), target: leadingFamily(b)}]
  },
}

export const DELTA_KINDS: DeltaKind[] = [
  insetLeft,
  insetRight,
  insetTop,
  insetBottom,
  boxWidth,
  boxHeight,
  gapBefore,
  gapAfter,
  align,
  padding,
  fontSize,
  lineHeight,
  fontWeight,
  font,
  background,
  foreground,
  radius,
  border,
  axis,
  columns,
  sizing,
]

type From = 'live' | 'target'

export function sideFrom(input: {
  pair: Pair
  from: From
  children: Pair[]
  page: Box
  raster: Raster
  color: ColorMetric
  glyphs: Box[]
  strip: Box | null
  nodes: TargetNode[]
}): Side {
  const {pair, from, children, page, raster, color, glyphs, strip, nodes} = input
  const box = pickBox({pair, from})
  return {
    kind: pair.node.kind,
    box,
    parent: pair.parent === null ? page : pickBox({pair: pair.parent, from}),
    prev: pair.prev === null ? null : pickBox({pair: pair.prev, from}),
    next: pair.next === null ? null : pickBox({pair: pair.next, from}),
    axis: pair.live.axis,
    flow: directionOn({pair, from, nodes}),
    columns: columnCount({pair, from, nodes}),
    textBox: contentBox({children, from}),
    edge: edgeOn({pair, from, raster, strip}),
    radius: radiusOn({pair, from}),
    padding: from === 'target' ? (pair.node.layout?.padding ?? null) : null,
    size: sizeOn({pair, from}),
    styles: sideStyles({pair, from, box, raster, color, glyphs}),
  }
}

export function opinionSide(input: {side: Side; pair: Pair; children: Pair[]}): Side | null {
  const {side, pair, children} = input
  const box = pair.live.opinion?.box
  if (box === undefined) return null
  const boxes = children.map((child) => child.live.opinion?.box)
  const known = boxes.filter((child) => child !== undefined)
  return {
    ...side,
    box,
    prev: opinionBox(pair.prev),
    next: opinionBox(pair.next),
    textBox: known.length === boxes.length ? union(known) : null,
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
const OUT_OF_FLOW = ['absolute', 'fixed']

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

function edgeOn(input: {pair: Pair; from: From; raster: Raster; strip: Box | null}): string | null {
  const {pair, from, raster, strip} = input
  if (strip === null) return null
  const {node} = pair
  if (from === 'target' && node.kind === 'box' && node.border !== null) return node.border.color
  return medianColor({raster: crop({raster, box: strip}).raster, exclude: new Uint8Array(strip.w * strip.h)})
}

function radiusOn(input: {pair: Pair; from: From}): number | null {
  const {pair, from} = input
  if (pair.node.kind !== 'box') return null
  return from === 'target' ? pair.node.radius : pair.live.styles.radius
}

function sizeOn(input: {pair: Pair; from: From}): Side['size'] {
  const {pair, from} = input
  if (from === 'target') return pair.node.layout?.size ?? null
  return pair.live.styles.sizing.width === 'fixed' ? 'fixed' : null
}

function opinionBox(pair: Pair | null): Box | null {
  return pair?.live.opinion?.box ?? null
}

function pickBox(input: {pair: Pair; from: From}): Box {
  return input.from === 'live' ? input.pair.liveBox : input.pair.targetBox
}

function directionOn(input: {pair: Pair; from: From; nodes: TargetNode[]}): Flow | null {
  const {pair, from, nodes} = input
  if (from === 'live') {
    const [first, second] = pair.live.children.filter(laysOut)
    if (first === undefined || second === undefined) return null
    return first.axis ?? 'column'
  }
  const layout = pair.node.layout
  if (layout?.direction === undefined) return null
  const children = nodes.filter((node) => node.within === pair.node.id)
  if (children.length < 2) return null
  if (laidOutChildren({pair, nodes}).length < children.length) return null
  if (pair.live.columns !== null && bothAxes(layout)) return null
  if (layout.direction === 'stack') return 'column'
  if (layout.direction === 'grid') return 'row'
  return layout.direction
}

function laidOutChildren(input: {pair: Pair; nodes: TargetNode[]}): TargetNode[] {
  const children = input.nodes.filter((node) => node.within === input.pair.node.id)
  return children.filter(
    (child) => !children.some((other) => other !== child && overlapping({a: child.box, b: other.box})),
  )
}

function overlapping(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  const across = Math.min(right(a), right(b)) - Math.max(a.x, b.x)
  const down = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y)
  return across > TOLERANCES.geometryPx && down > TOLERANCES.geometryPx
}

function laysOut(component: LiveComponent): boolean {
  return !OUT_OF_FLOW.includes(component.styles.position)
}

function bothAxes(layout: NodeLayout): boolean {
  return layout.direction === 'grid' || layout.wrap === true || (layout.runs ?? []).length > 0
}

function columnCount(input: {pair: Pair; from: From; nodes: TargetNode[]}): number | null {
  const {pair, from, nodes} = input
  if (pair.live.columns === null) return null
  if (from === 'live') {
    const items = firstRow(flowItems(pair.live)).length
    return items === 0 ? null : items
  }
  const kept = laidOutChildren({pair, nodes})
  if (kept.length < 2) return null
  const spans = firstRow(kept)
    .flatMap((node) => leavesUnder({node, nodes}))
    .map((node) => node.box)
    .toSorted((a, b) => a.x - b.x)
  const bands = spans.reduce<{end: number; count: number}>(
    (state, box) =>
      box.x >= state.end - FLOW_BAND
        ? {end: box.x + box.w, count: state.count + 1}
        : {end: Math.max(state.end, box.x + box.w), count: state.count},
    {end: Number.NEGATIVE_INFINITY, count: 0},
  )
  return bands.count === 0 ? null : bands.count
}

function flowItems(component: LiveComponent): LiveComponent[] {
  return component.children
    .filter(laysOut)
    .flatMap((child) => (child.box.w === 0 && child.box.h === 0 ? flowItems(child) : [child]))
}

function firstRow<Entry extends {box: Box}>(entries: Entry[]): Entry[] {
  const top = minBy(entries, (entry) => entry.box.y)
  if (top === undefined) return []
  const slack = TOLERANCES.geometryPx
  return entries.filter(({box}) => box.y < bottom(top.box) - slack && bottom(box) > top.box.y + slack)
}

function leavesUnder(input: {node: TargetNode; nodes: TargetNode[]}): TargetNode[] {
  const {node, nodes} = input
  const children = nodes.filter((child) => child.within === node.id)
  if (children.length === 0) return [node]
  return children.flatMap((child) => leavesUnder({node: child, nodes}))
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
    return {...designPaint({pair, sampled: fills.background}), ...color, ...estimatedType(pair)}
  }
  const {background: declared, color: _declared, ...rest} = pair.live.styles
  return {...rest, ...(isOpaqueHex(declared) ? {background: declared} : {}), ...color}
}

function designPaint(input: {pair: Pair; sampled: string}): Partial<LiveStyles> {
  const {node} = input.pair
  if (node.kind !== 'box' || node.paint === undefined) return {background: input.sampled}
  const {gradient} = node.paint
  return gradient === undefined ? {background: node.paint.background} : {background: node.paint.background, gradient}
}

function estimatedType(pair: Pair): Partial<LiveStyles> {
  const typography = pair.texts.find((text) => text.typography !== undefined)?.typography
  if (typography === undefined) return {}
  const family = typography.family === null ? {} : {fontFamily: typography.family}
  return {fontSize: typography.size, lineHeight: typography.lineHeight, fontWeight: typography.weight, ...family}
}
