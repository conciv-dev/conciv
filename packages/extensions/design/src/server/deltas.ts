import {median, minBy, omit, zip} from 'es-toolkit'
import {
  iconSized,
  isOpaqueHex,
  kindStage,
  kindTolerance,
  leadingFamily,
  sameFamily,
  TOLERANCES,
} from '../shared/tolerances.js'
import {
  type Box,
  type ColorMetric,
  type Decision,
  type Delta,
  type DeltaKind,
  type Deltas,
  type Element,
  type Flow,
  type Geometry,
  type Gradient,
  type ItemKind,
  type LiveBorder,
  type LiveComponent,
  type LiveRole,
  type LiveStyles,
  type LiveText,
  type LiveTextReader,
  type Match,
  type MatchNode,
  type MeasureSource,
  type Raster,
  type Reuse,
  type Role,
  type Shift,
  type Side,
  type Stage,
  type TextJudgement,
} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import {encloses, expand, readingOrder, union} from '../shared/box.js'

export function createDeltas(input: {geometry: Geometry; color: ColorMetric; liveText: LiveTextReader}): Deltas {
  const {geometry, color, liveText} = input
  return {
    elements: (request) => elementsOf({...request, geometry}),
    measure: (request) => deltasFor({...request, color, liveText}),
    warnings: (request) => warningsFor({...request, liveText}),
    size: (delta) => deltaSize({delta, color}),
    sourced,
    sameWords,
  }
}

function elementsOf(input: Parameters<Deltas['elements']>[0] & {geometry: Geometry}): Element[] {
  const paired = [...walk({root: input.root})].flatMap(({node, depth}) =>
    depth === 0 || node.live === null ? [] : [{match: node, path: node.live.path}],
  )
  const byPath = Map.groupBy(paired, (entry) => entry.path)
  return grown({
    ...input,
    components: input.live.children,
    parent: null,
    host: null,
    depth: 1,
    byPath,
    selectorOf: input.geometry.selectors(input.live),
  })
}

async function deltasFor(
  input: Parameters<Deltas['measure']>[0] & {color: ColorMetric; liveText: LiveTextReader},
): ReturnType<Deltas['measure']> {
  const {elements, decisions, color, stamp} = input
  const judged = await textJudgements({elements, liveText: input.liveText})
  const measures = cachedMeasures(input)
  const measured = elements.map((element) => ({
    element,
    deltas: decided({
      deltas: slotDeltas({
        element,
        deltas: pixelRow({
          element,
          deltas: [...(measures.get(element)?.deltas ?? []), ...textDeltas({element, judged})],
        }),
      }).map((delta) => ({...delta, ...stamp})),
      element,
      decisions,
      color,
    }),
  }))
  return {measured, measures: new Map([...measures.values()].map((entry) => [entry.key, entry.deltas])), judged}
}

async function warningsFor(input: Parameters<Deltas['warnings']>[0] & {liveText: LiveTextReader}): Promise<Delta[]> {
  return [
    ...drawnWarnings({elements: input.elements, components: input.components, root: input.root}),
    ...(await warningDeltas(input)),
  ]
}

function grown(input: {
  components: LiveComponent[]
  parent: Element | null
  host: Element['host']
  depth: number
  geometry: Geometry
  byPath: Map<string, {match: Match; path: string}[]>
  selectorOf: Map<string, string>
  raster: Raster
  exact: boolean
  source: MeasureSource
  mismatchAt: (box: Box) => number
}): Element[] {
  const {components, parent, depth, byPath, selectorOf} = input
  const level = components.map((component) => {
    const owner = {selector: selectorOf.get(component.path) ?? component.tag, live: component}
    const entries = (byPath.get(component.path) ?? []).map((entry) => entry.match)
    const head = entries.find((entry) => entry.node.kind !== 'text') ?? entries[0]
    const element =
      head === undefined ? null : madeElement({...input, component, entries, head, selector: owner.selector})
    return {element, component, owner}
  })
  const siblings = level.flatMap((entry) => entry.element ?? [])
  siblings.forEach((element, index) => {
    element.prev = siblings[index - 1] ?? null
    element.next = siblings[index + 1] ?? null
  })
  return level.flatMap(({element, component, owner}) => {
    const below = grown({
      ...input,
      components: component.children,
      parent: element ?? parent,
      host: owner,
      depth: element === null ? depth : depth + 1,
    })
    return element === null ? below : [element, ...below]
  })
}

function madeElement(input: {
  component: LiveComponent
  entries: Match[]
  head: Match
  selector: string
  parent: Element | null
  host: Element['host']
  depth: number
  geometry: Geometry
  raster: Raster
  exact: boolean
  source: MeasureSource
  mismatchAt: (box: Box) => number
}): Element {
  const {component, entries, head, raster, exact} = input
  const texts = entries.flatMap((entry) => (entry.node.kind === 'text' ? [entry.node] : []))
  const element: Element = {
    match: head,
    live: component,
    node: head.node,
    texts,
    source: input.source,
    confidence: Math.max(...entries.map((entry) => entry.confidence)),
    selector: input.selector,
    liveBox: component.box,
    targetBox: component.box,
    mismatch: input.mismatchAt(component.box),
    depth: input.depth,
    parent: input.parent,
    host: input.host,
    prev: null,
    next: null,
  }
  if (head.node.kind !== 'text') return {...element, targetBox: head.node.box}
  if (exact && texts.length > 0) return {...element, targetBox: union(texts.map((text) => text.box))}
  const boxes = texts.map((node) => input.geometry.targetBox({node, live: component, raster, exact: false}))
  const dx = median0(boxes.map((box) => box.x - component.box.x))
  const dy = median0(boxes.map((box) => box.y - component.box.y))
  return {...element, targetBox: {...component.box, x: component.box.x + dx, y: component.box.y + dy}}
}

function median0(values: number[]): number {
  return values.length === 0 ? 0 : median(values)
}

function deltaSize(input: {delta: Delta; color: ColorMetric}): number {
  const {delta, color} = input
  const {live, target} = delta
  const gradient = [live, target].some((paint) => typeof paint === 'string' && paint.startsWith(GRADIENT_WORD))
  if (delta.kind === 'background' && gradient && typeof live === 'string' && typeof target === 'string') {
    return capped(gradientDistance({live, target, color}) / TOLERANCES.colorDeltaE)
  }
  if (COLOR_KINDS.includes(delta.kind) && typeof live === 'string' && typeof target === 'string') {
    return capped(color.distance({a: live, b: target}) / TOLERANCES.colorDeltaE)
  }
  if (typeof live !== 'number' || typeof target !== 'number') return SIZE_CAP
  const span = delta.kind === 'lines' ? (delta.lineHeight ?? 1) : 1
  return capped((Math.abs(live - target) * span) / kindTolerance(delta.kind))
}

function sourced(input: {delta: Delta; element: Element}): Delta {
  const {source} = input.element.live
  if (source === null) return input.delta
  return {...input.delta, via: 'source', file: source.file, line: source.line, column: source.column}
}

function sameWords(text: string): string {
  const points = Array.from(text.trim()).flatMap((point) => Array.from(CONFUSABLES[point] ?? point))
  if (!points.some(casedLetter)) return folded(points.join(''))
  const start = loneGlyph(points[0]) ? 1 : 0
  const end = loneGlyph(points.at(-1)) ? points.length - 1 : points.length
  return folded(points.slice(start, end).join(''))
}

function cachedMeasures(input: {
  elements: Element[]
  reuse: Reuse | null
  shift: Shift
  live: Raster
  target: Raster
  page: Box
  color: ColorMetric
}): Map<Element, {key: string; deltas: Delta[]}> {
  const {elements, reuse, shift, live, target, page, color} = input
  return new Map(
    elements.map((element): [Element, {key: string; deltas: Delta[]}] => {
      const key = measureKey({element, elements, shift})
      const kept = reuse?.measures.get(key)
      const region = expand({
        box: union([element.liveBox, moved({box: element.liveBox, shift})]),
        by: TOLERANCES.tileSide,
      })
      if (kept !== undefined && reuse !== null && reuse.unchanged(region)) return [element, {key, deltas: kept}]
      const deltas = measureDeltas({element, elements, live, target, page, shift, color})
      return [element, {key, deltas}]
    }),
  )
}

function measureKey(input: {element: Element; elements: Element[]; shift: Shift}): string {
  const {element, elements, shift} = input
  const boxes = (other: Element | null): Box[] | null => (other === null ? null : [other.liveBox, other.targetBox])
  return JSON.stringify({
    node: element.node,
    live: omit(element.live, ['children']),
    texts: element.texts.map((node) => node.box),
    boxes: boxes(element),
    parent: boxes(element.parent),
    prev: boxes(element.prev),
    next: boxes(element.next),
    under: elements.filter((other) => under({element: other, ancestor: element})).map(boxes),
    designed: element.match.children.length,
    shift,
  })
}

function under(input: {element: Element; ancestor: Element}): boolean {
  const parent = input.element.parent
  if (parent === null) return false
  return parent === input.ancestor || under({element: parent, ancestor: input.ancestor})
}

function moved(input: {box: Box; shift: Shift}): Box {
  return {...input.box, x: input.box.x + input.shift.dx, y: input.box.y + input.shift.dy}
}

function decided(input: {deltas: Delta[]; element: Element; decisions: Decision[]; color: ColorMetric}): Delta[] {
  const {element, decisions, color} = input
  const anchors = new Set([element.node.id, ...element.texts.map((node) => node.id)])
  const mine = decisions.filter((entry) => anchors.has(entry.anchor))
  const accepted = new Set(mine.filter((entry) => entry.kind === 'accept-delta').map((entry) => String(entry.value)))
  const scale = mine.reduce(
    (found, entry) => (entry.kind === 'tolerance' && typeof entry.value === 'number' ? entry.value : found),
    1,
  )
  return input.deltas
    .filter((delta) => !accepted.has(delta.kind))
    .filter((delta) => scale === 1 || deltaSize({delta, color}) > scale)
}

async function textJudgements(input: {
  elements: Element[]
  liveText: LiveTextReader
}): Promise<Map<Element, TextJudgement>> {
  const judged = await Promise.all(
    input.elements
      .filter((element) => element.texts.length > 0)
      .map(async (element): Promise<[Element, TextJudgement]> => {
        const liveText = joinedText(element.live.glyphs.map((glyph) => glyph.text))
        const targetText = joinedText(
          element.texts.toSorted((a, b) => readingOrder(a.box, b.box)).map((node) => node.text),
        )
        const live = await input.liveText(element.live.source)
        const roles = new Set(element.texts.map((node) => node.role ?? 'unknown'))
        const [only] = roles
        const role: Role = roles.size === 1 && only !== undefined ? only : 'unknown'
        const equal =
          live === null ? sameWords(liveText) === sameWords(targetText) : literalsAgree({live, liveText, targetText})
        return [
          element,
          {
            verdict: textDelta({live: live?.role ?? 'literal', target: role, equal}),
            live: liveText,
            target: targetText,
          },
        ]
      }),
  )
  return new Map(judged)
}

function joinedText(texts: string[]): string {
  return texts
    .map((text) => text.trim())
    .filter((text) => text !== '')
    .join(' ')
}

function slotDeltas(input: {element: Element; deltas: Delta[]}): Delta[] {
  const {element, deltas} = input
  if (element.node.kind !== 'image') return deltas
  if (element.live.placeholder === null) return deltas.filter((delta) => !PICTURE_PAINT.has(delta.kind))
  return deltas.filter((delta) => !SLOT_STAGES.has(kindStage(delta.kind)))
}

const SLOT_STAGES = new Set<Stage | null>(['paint', 'content'])

const PICTURE_PAINT = new Set<Delta['kind']>(['background', 'foreground', 'border', 'pixels'])

function pixelRow(input: {element: Element; deltas: Delta[]}): Delta[] {
  const {element, deltas} = input
  if (deltas.length > 0 || element.mismatch < TOLERANCES.pixelGate) return deltas
  return [{kind: 'pixels', live: rounded(element.mismatch), target: 0}]
}

function textDeltas(input: {element: Element; judged: Map<Element, TextJudgement>}): Delta[] {
  const found = input.judged.get(input.element)
  if (found === undefined || found.verdict !== 'text') return []
  return [{kind: 'text', live: found.live, target: found.target}]
}

async function warningDeltas(input: {
  elements: Element[]
  judged: Map<Element, TextJudgement>
  components: LiveComponent[]
  liveText: LiveTextReader
}): Promise<Delta[]> {
  const {judged} = input
  const parents = new Map(
    flattened(input.components).flatMap((parent) =>
      parent.children.map((child): [string, LiveComponent] => [child.path, parent]),
    ),
  )
  const flagged = await Promise.all(
    input.elements.map(async (element): Promise<Delta[]> => {
      const found = judged.get(element)
      if (found === undefined || found.verdict !== 'sample-data') return []
      const marked = element.texts.some((node) => node.role === 'placeholder')
      if (!marked && !(await rendersData({element, parent: parents.get(element.live.path), liveText: input.liveText})))
        return []
      return [
        sourced({
          delta: {kind: 'text', live: found.live, target: found.target, warning: 'sample-data', box: element.liveBox},
          element,
        }),
      ]
    }),
  )
  return flagged.flat()
}

function drawnWarnings(input: {elements: Element[]; components: LiveComponent[]; root: Match}): Delta[] {
  const slots = [...walk({root: input.root})].flatMap(({node}) => (node.node.kind === 'image' ? [node.node] : []))
  const paired = new Map(input.elements.map((element) => [element.live.path, element.node]))
  return flattened(input.components).flatMap((component): Delta[] => {
    if (!component.drawn) return []
    const own = paired.get(component.path)
    const slot = own?.kind === 'image' ? own : slots.find((node) => encloses({inner: component.box, outer: node.box}))
    if (slot === undefined) return []
    const kind = iconSized(slot.box) ? 'icon' : 'image'
    return [
      {
        kind: 'background',
        live: drawnLabel(component.tag),
        target: `<Placeholder kind="${kind}" />`,
        warning: 'svg-drawn',
        selector: component.tag,
        box: component.box,
        ...(component.source === null
          ? {}
          : {via: 'source', file: component.source.file, line: component.source.line, column: component.source.column}),
      },
    ]
  })
}

function drawnLabel(tag: string): string {
  if (tag === 'svg') return 'drawn svg'
  if (tag === 'img') return 'drawn data url'
  return 'drawn canvas'
}

async function rendersData(input: {
  element: Element
  parent: LiveComponent | undefined
  liveText: LiveTextReader
}): Promise<boolean> {
  const {element, parent, liveText} = input
  if (parent === undefined) return false
  const siblings = parent.children.filter((child) => child.path !== element.live.path && child.text.trim() !== '')
  const texts = await Promise.all(siblings.map((sibling) => liveText(sibling.source)))
  return texts.some((text) => text !== null && text.role !== 'literal')
}

function flattened(components: LiveComponent[]): LiveComponent[] {
  return components.flatMap((component) => [component, ...flattened(component.children)])
}

type TextVerdict = TextJudgement['verdict']

function textDelta(input: {live: LiveRole; target: Role; equal: boolean}): TextVerdict {
  const {live, target, equal} = input
  switch (live) {
    case 'expression':
      return null
    case 'mixed':
      return target === 'unknown' && !equal ? 'text' : null
    case 'literal':
      if (equal) return target === 'unknown' ? null : 'sample-data'
      return target === 'placeholder' ? null : 'text'
  }
}

function literalsAgree(input: {live: LiveText; liveText: string; targetText: string}): boolean {
  const {live, liveText, targetText} = input
  if (live.role !== 'mixed') return sameWords(liveText) === sameWords(targetText)
  const target = sameWords(targetText)
  return live.literals.every((literal) => target.includes(sameWords(literal)))
}

function casedLetter(point: string): boolean {
  return point.toLowerCase() !== point.toUpperCase()
}

function loneGlyph(point: string | undefined): boolean {
  if (point === undefined || casedLetter(point) || KEPT_GLYPHS.has(point)) return false
  return point < '0' || point > '9'
}

const KEPT_GLYPHS: ReadonlySet<string> = new Set(['%', '$', '€', '£', '¥', '¢', '₪', '₹', '₩', '₽', '₺'])

function folded(text: string): string {
  return [...text.toLowerCase()].filter((character) => character.trim() !== '').join('')
}

const SIZE_CAP = 10

const COLOR_KINDS: ItemKind[] = ['background', 'foreground', 'border']

const GRADIENT_WORD = 'gradient '

function gradientDistance(input: {live: string; target: string; color: ColorMetric}): number {
  const {live, target, color} = input
  const shown = paintEnds(live)
  const design = paintEnds(target)
  const elements =
    shown.length === design.length
      ? zip(shown, design).map(([a, b]) => ({a, b}))
      : shown.flatMap((a) => design.map((b) => ({a, b})))
  return Math.max(...elements.map((element) => color.distance(element)))
}

function paintEnds(paint: string): string[] {
  if (!paint.startsWith(GRADIENT_WORD)) return [paint]
  const [, from = paint, , to = paint] = paint.split(' ')
  return [from, to]
}

function capped(value: number): number {
  return Math.min(SIZE_CAP, value)
}

function rounded(mismatch: number): number {
  return Math.round(mismatch * MISMATCH_PRECISION) / MISMATCH_PRECISION
}

const MISMATCH_PRECISION = 10_000

const CONFUSABLES: Record<string, string> = {
  '›': '>',
  '»': '>',
  '‹': '<',
  '«': '<',
  '—': '-',
  '–': '-',
  '“': '"',
  '”': '"',
  '„': '"',
  '‘': "'",
  '’': "'",
  '…': '...',
  '×': 'x',
  '•': '-',
  '·': '-',
}

function measureDeltas(input: {
  element: Element
  elements: Element[]
  live: Raster
  target: Raster
  page: Box
  color: ColorMetric
  shift: Shift
}): Delta[] {
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
  const deltas = DELTA_KINDS.flatMap((kind) => kind.measure({live: liveSide, target: targetSide, color}))
  const opinion = opinionSide({side: liveSide, element, children})
  const confidence = element.live.opinion?.confidence
  if (opinion === null || confidence === undefined) return deltas
  return deltas.map((delta) => withOpinion({delta, side: opinion, confidence}))
}

function withOpinion(input: {delta: Delta; side: Side; confidence: number}): Delta {
  const {delta, side, confidence} = input
  const live = DELTA_KINDS.find((kind) => kind.kind === delta.kind)?.read?.(side) ?? null
  if (live === null) return delta
  return {...delta, opinion: {source: 'takumi', live, confidence}}
}

type From = 'live' | 'target'

function sideFrom(input: {
  element: Element
  from: From
  children: Element[]
  page: Box
  raster: Raster
  color: ColorMetric
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
    textBox: known.length === boxes.length ? boundsOf(known) : null,
  }
}

function edgeStrip(input: {
  element: Element
  raster: Raster
  color: ColorMetric
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
  const inside = raster.fills({box, glyphs: [box], color}).background
  const scored = strips.map((strip) => {
    const seen = raster.crop({box: strip}).raster.median(new Uint8Array(strip.w * strip.h))
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

function edgeOn(input: {element: Element; from: From; raster: Raster; strip: Box | null}): string | null {
  const {element, from, raster, strip} = input
  if (strip === null) return null
  const {node} = element
  if (from === 'target' && node.kind === 'box' && node.border !== null) return node.border.color
  return raster.crop({box: strip}).raster.median(new Uint8Array(strip.w * strip.h))
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
          ? {end: bottomEdge(box), count: state.count + 1}
          : {end: Math.max(state.end, bottomEdge(box)), count: state.count},
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
  const across = Math.min(rightEdge(a), rightEdge(b)) - Math.max(a.x, b.x)
  const down = Math.min(bottomEdge(a), bottomEdge(b)) - Math.max(a.y, b.y)
  return across > TOLERANCES.geometryPx && down > TOLERANCES.geometryPx
}

function laysOut(component: LiveComponent): boolean {
  return !OUT_OF_FLOW.includes(component.styles.position)
}

function bothAxes(layout: NonNullable<MatchNode['layout']>): boolean {
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
  return entries.filter(({box}) => box.y < bottomEdge(top.box) - slack && bottomEdge(box) > top.box.y + slack)
}

function leavesUnder(match: Match): Box[] {
  if (match.children.length === 0) return [match.node.box]
  return match.children.flatMap(leavesUnder)
}

function inkOn(input: {from: From; glyphs: Box[]}): Box | null {
  const ink = input.from === 'live' ? boundsOf(input.glyphs) : null
  if (ink === null) return null
  const halo = TOLERANCES.glyphHalo
  return {x: ink.x + halo, y: ink.y + halo, w: ink.w - halo * 2, h: ink.h - halo * 2}
}

function contentBox(input: {children: Element[]; from: From}): Box | null {
  const {children, from} = input
  return boundsOf(children.map((element) => pickBox({element, from})))
}

function sideStyles(input: {
  element: Element
  from: From
  box: Box
  raster: Raster
  color: ColorMetric
  glyphs: Box[]
}): Partial<LiveStyles> {
  const {element, from, box, raster} = input
  const paintsText = element.live.glyphs.length > 0
  const glyphs = input.glyphs.length === 0 ? [box] : input.glyphs
  const fills = raster.fills({box, glyphs, color: input.color})
  const color = paintsText && fills.foreground !== null ? {color: fills.foreground} : {}
  if (from === 'target') {
    return {...designPaint({element, sampled: fills.background}), ...color, ...estimatedType(element)}
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

const insetLeft = insetKind('left')

const insetRight = insetKind('right')

const insetTop = insetKind('top')

const insetBottom = insetKind('bottom')

function gapBetween(input: {first: Box; second: Box; axis: 'row' | 'column'}): number {
  const {first, second, axis} = input
  return Math.round(axis === 'row' ? second.x - rightEdge(first) : second.y - bottomEdge(first))
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

const gapAfter: DeltaKind = {...gapKind(false), measure: () => []}

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
      if (target.kind === 'text' && (key === 'h' || !overflowsParent(live))) return []
      const a = target.kind === 'text' ? Math.round(extent(live)[key]) : read(live)
      const b = read(target)
      if (!insetDiffers({live: a, target: b})) return []
      return [{kind, live: a, target: b}]
    },
  }
}

function overflowsParent(side: Side): boolean {
  const {parent} = side
  if (parent === null) return false
  const box = extent(side)
  return parent.x - box.x > TOLERANCES.geometryPx || rightEdge(box) - rightEdge(parent) > TOLERANCES.geometryPx
}

const boxWidth = sizeKind({kind: 'width', key: 'w'})

const boxHeight = sizeKind({kind: 'height', key: 'h'})

const lines: DeltaKind = {
  kind: 'lines',
  measure: ({live, target}) => {
    if (target.kind !== 'text' || live.lines === null || target.lines === null || live.lines === target.lines) return []
    const spacing = target.styles.lineHeight ?? live.styles.lineHeight
    return [
      {kind: 'lines', live: live.lines, target: target.lines, ...(spacing === undefined ? {} : {lineHeight: spacing})},
    ]
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

const DELTA_KINDS: DeltaKind[] = [
  insetLeft,
  insetRight,
  insetTop,
  insetBottom,
  boxWidth,
  boxHeight,
  lines,
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

function extent(side: Side): Box {
  return side.ink === null ? side.box : (boundsOf([side.box, side.ink]) ?? side.box)
}

function boundsOf(boxes: Box[]): Box | null {
  return boxes.length === 0 ? null : union(boxes)
}

function rightEdge(box: Box): number {
  return box.x + box.w
}

function bottomEdge(box: Box): number {
  return box.y + box.h
}
