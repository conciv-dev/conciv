import {minBy} from 'es-toolkit'
import type {Box, LiveComponent, Match, Raster} from '../shared/defs.js'
import {box as geometry} from '../shared/box.js'
import {designConfig} from '../shared/tolerances.js'

export function readSides(input: {
  element: Element
  elements: Element[]
  live: Raster
  target: Raster
  page: Box
  color: string
  shift: Shift
}): {live: Side; target: Side; opinion: Side | null} {
  const {element, elements, live, target, page, color, shift} = input
  const children = elements.filter((child) => child.parent === element)
  const strip = edgeStrip({element, raster: live, color, shift: {dx: 0, dy: 0}, toward: 'declared'})
  const liveSide = sideFrom({
    element,
    from: 'live',
    children,
    page,
    raster: live,
    color,
    glyphs: element.live.glyphs.flatMap((glyph) => glyph.boxes),
    strip,
  })
  const targetSide = sideFrom({
    element,
    from: 'target',
    children,
    page,
    raster: target,
    color,
    glyphs: element.texts.map((node) => node.box),
    strip: strip === null ? null : edgeStrip({element, raster: target, color, shift, toward: 'contrast'}),
  })
  return {live: liveSide, target: targetSide, opinion: opinionSide({side: liveSide, element, children})}
}

type Node = Match['node']

type TextNode = Extract<Node, {kind: 'text'}>

type LiveStyles = LiveComponent['styles']

type Shift = {dx: number; dy: number}

type Element = {
  match: Match
  live: LiveComponent
  node: Node
  texts: TextNode[]
  confidence: number
  selector: string
  liveBox: Box
  targetBox: Box
  mismatch: number
  depth: number
  parent: Element | null
  host: {selector: string; live: LiveComponent} | null
  prev: Element | null
  next: Element | null
}

type Side = {
  kind: Node['kind']
  box: Box
  parent: Box | null
  prev: Box | null
  next: Box | null
  axis: 'row' | 'column' | null
  flow: Flow | null
  columns: number | null
  textBox: Box | null
  ink: Box | null
  lines: number | null
  edge: string | null
  radius: number | null
  padding: NonNullable<NonNullable<Node['layout']>['padding']> | null
  size: NonNullable<NonNullable<Node['layout']>['size']> | null
  styles: Partial<LiveStyles>
}

type Flow = 'row' | 'column'

const TOLERANCES = designConfig.tolerances

type From = 'live' | 'target'

function sideFrom(input: {
  element: Element
  from: From
  children: Element[]
  page: Box
  raster: Raster
  color: string
  glyphs: Box[]
  strip: Box | null
}): Side {
  const {element, from, children, page, raster, color, glyphs, strip} = input
  const box = pickBox({element, from})
  return {
    kind: element.node.kind,
    box,
    parent: element.parent === null ? page : pickBox({element: element.parent, from}),
    prev: element.prev === null ? null : pickBox({element: element.prev, from}),
    next: element.next === null ? null : pickBox({element: element.next, from}),
    axis: element.live.axis,
    flow: directionOn({element, from}),
    columns: columnCount({element, from}),
    textBox: contentBox({children, from}),
    ink: inkOn({from, glyphs}),
    lines: lineCount({element, from}),
    edge: edgeOn({element, from, raster, strip}),
    radius: radiusOn({element, from}),
    padding: from === 'target' ? (element.node.layout?.padding ?? null) : null,
    size: sizeOn({element, from}),
    styles: sideStyles({element, from, box, raster, color, glyphs}),
  }
}

function opinionSide(input: {side: Side; element: Element; children: Element[]}): Side | null {
  const {side, element, children} = input
  const box = element.live.opinion?.box
  if (box === undefined) return null
  const boxes = children.map((child) => child.live.opinion?.box)
  const known = boxes.filter((child) => child !== undefined)
  return {
    ...side,
    box,
    prev: opinionBox(element.prev),
    next: opinionBox(element.next),
    textBox: known.length === boxes.length ? geometry.bounds(known) : null,
  }
}

function edgeStrip(input: {
  element: Element
  raster: Raster
  color: string
  shift: {dx: number; dy: number}
  toward: 'declared' | 'contrast'
}): Box | null {
  const {element, raster, color, shift, toward} = input
  const declared = element.live.styles.border
  if (declared.width <= 0 || declared.style === 'none' || declared.style === 'hidden') return null
  const box = {...element.liveBox, x: element.liveBox.x + shift.dx, y: element.liveBox.y + shift.dy}
  const strips = EDGE_OFFSETS.flatMap(
    (offset) => stripAt({box, side: declared.side, width: declared.width, offset}) ?? [],
  )
  const inside = raster.fills({box, glyphs: [box], color})[0] ?? ''
  const scored = strips.map((strip) => {
    const seen = designConfig.hex(raster.crop({box: strip}).median([]))
    const score =
      toward === 'declared'
        ? -designConfig.colorMetrics.ciede2000({a: seen, b: declared.color})
        : designConfig.colorMetrics.ciede2000({a: seen, b: inside})
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

function stripAt(input: {box: Box; side: LiveStyles['border']['side']; width: number; offset: number}): Box | null {
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

function edgeOn(input: {element: Element; from: From; raster: Raster; strip: Box | null}): string | null {
  const {element, from, raster, strip} = input
  if (strip === null) return null
  const {node} = element
  if (from === 'target' && node.kind === 'box' && node.border !== null) return node.border.color
  return designConfig.hex(raster.crop({box: strip}).median([]))
}

function radiusOn(input: {element: Element; from: From}): number | null {
  const {element, from} = input
  if (element.node.kind !== 'box') return null
  return from === 'target' ? element.node.radius : element.live.styles.radius
}

function sizeOn(input: {element: Element; from: From}): Side['size'] {
  const {element, from} = input
  if (from === 'target') return element.node.layout?.size ?? null
  return element.live.styles.sizing.width === 'fixed' ? 'fixed' : null
}

function lineCount(input: {element: Element; from: From}): number | null {
  const {element, from} = input
  const {node} = element
  if (node.kind !== 'text') return null
  if (from === 'live') return bandCount(element.live.glyphs.flatMap((glyph) => glyph.boxes))
  if (node.lines.length > 0) return bandCount(node.lines.map((line) => line.box))
  const spacing = node.typography?.lineHeight ?? 0
  if (spacing <= 0) return null
  return Math.max(1, Math.round(node.box.h / spacing))
}

function bandCount(boxes: Box[]): number | null {
  const bands = boxes
    .toSorted((a, b) => a.y - b.y)
    .reduce<{end: number; count: number}>(
      (state, box) =>
        box.y + box.h / 2 >= state.end
          ? {end: geometry.bottom(box), count: state.count + 1}
          : {end: Math.max(state.end, geometry.bottom(box)), count: state.count},
      {end: Number.NEGATIVE_INFINITY, count: 0},
    )
  return bands.count === 0 ? null : bands.count
}

function opinionBox(element: Element | null): Box | null {
  return element?.live.opinion?.box ?? null
}

function pickBox(input: {element: Element; from: From}): Box {
  return input.from === 'live' ? input.element.liveBox : input.element.targetBox
}

function directionOn(input: {element: Element; from: From}): Flow | null {
  const {element, from} = input
  if (from === 'live') {
    const [first, second] = element.live.children.filter(laysOut)
    if (first === undefined || second === undefined) return null
    return first.axis ?? 'column'
  }
  const layout = element.node.layout
  if (layout?.direction === undefined) return null
  const {children} = element.match
  if (children.length < 2) return null
  if (laidOutChildren(element).length < children.length) return null
  if (element.live.columns !== null && bothAxes(layout)) return null
  if (layout.direction === 'stack') return 'column'
  if (layout.direction === 'grid') return 'row'
  return layout.direction
}

function laidOutChildren(element: Element): {box: Box; match: Match}[] {
  return unoverlapped(element.match.children.map((match) => ({box: match.node.box, match})))
}

function unoverlapped<Entry extends {box: Box}>(entries: Entry[]): Entry[] {
  return entries.filter(
    (entry) => !entries.some((other) => other !== entry && boxesOverlap({a: entry.box, b: other.box})),
  )
}

function boxesOverlap(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  const across = Math.min(geometry.right(a), geometry.right(b)) - Math.max(a.x, b.x)
  const down = Math.min(geometry.bottom(a), geometry.bottom(b)) - Math.max(a.y, b.y)
  return across > TOLERANCES.geometryPx && down > TOLERANCES.geometryPx
}

function laysOut(component: LiveComponent): boolean {
  return !OUT_OF_FLOW.includes(component.styles.position)
}

function bothAxes(layout: NonNullable<Node['layout']>): boolean {
  return layout.direction === 'grid' || layout.wrap === true || (layout.runs ?? []).length > 0
}

function columnCount(input: {element: Element; from: From}): number | null {
  const {element, from} = input
  if (element.live.columns === null) return null
  if (from === 'live') {
    const row = unoverlapped(firstRow(flowItems(element.live)))
    if (row.length < 2) return null
    return countedBands(row.map((item) => item.box))
  }
  const kept = laidOutChildren(element)
  if (kept.length < 2) return null
  return countedBands(firstRow(kept).flatMap(({match}) => leavesUnder(match)))
}

function countedBands(boxes: Box[]): number | null {
  const bands = boxes
    .toSorted((a, b) => a.x - b.x)
    .reduce<{end: number; count: number}>(
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
  return entries.filter(({box}) => box.y < geometry.bottom(top.box) - slack && geometry.bottom(box) > top.box.y + slack)
}

function leavesUnder(match: Match): Box[] {
  if (match.children.length === 0) return [match.node.box]
  return match.children.flatMap(leavesUnder)
}

function inkOn(input: {from: From; glyphs: Box[]}): Box | null {
  const ink = input.from === 'live' ? geometry.bounds(input.glyphs) : null
  if (ink === null) return null
  const halo = TOLERANCES.glyphHalo
  return {x: ink.x + halo, y: ink.y + halo, w: ink.w - halo * 2, h: ink.h - halo * 2}
}

function contentBox(input: {children: Element[]; from: From}): Box | null {
  const {children, from} = input
  return geometry.bounds(children.map((element) => pickBox({element, from})))
}

function sideStyles(input: {
  element: Element
  from: From
  box: Box
  raster: Raster
  color: string
  glyphs: Box[]
}): Partial<LiveStyles> {
  const {element, from, box, raster} = input
  const paintsText = element.live.glyphs.length > 0
  const glyphs = input.glyphs.length === 0 ? [box] : input.glyphs
  const [sampled = '', foreground] = raster.fills({box, glyphs, color: input.color})
  const color = paintsText && foreground !== undefined ? {color: foreground} : {}
  if (from === 'target') {
    return {...designPaint({element, sampled}), ...color, ...estimatedType(element)}
  }
  const {background: declared, color: _declared, ...rest} = element.live.styles
  return {...rest, ...(isOpaqueHex(declared) ? {background: declared} : {}), ...color}
}

function designPaint(input: {element: Element; sampled: string}): Partial<LiveStyles> {
  const {node} = input.element
  if (node.kind !== 'box' || node.paint === undefined) return {background: input.sampled}
  const {gradient} = node.paint
  return gradient === undefined ? {background: node.paint.background} : {background: node.paint.background, gradient}
}

function estimatedType(element: Element): Partial<LiveStyles> {
  const typography = element.texts.find((text) => text.typography !== undefined)?.typography
  if (typography === undefined) return {}
  const family = typography.family === null ? {} : {fontFamily: typography.family}
  return {fontSize: typography.size, lineHeight: typography.lineHeight, fontWeight: typography.weight, ...family}
}

function isOpaqueHex(color: string): boolean {
  return color.startsWith('#') && color.length === OPAQUE_HEX_LENGTH
}

const OPAQUE_HEX_LENGTH = 7
