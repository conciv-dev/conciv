import {median, omit, zip} from 'es-toolkit'
import {iconSized, kindStage, kindTolerance, TOLERANCES} from '../shared/tolerances.js'
import {
  type Box,
  type ColorMetric,
  type Decision,
  type Delta,
  type DeltaKind,
  type Deltas,
  type Element,
  type Geometry,
  type ItemKind,
  type LiveComponent,
  type LiveRole,
  type LiveText,
  type LiveTextReader,
  type Match,
  type MeasureSource,
  type Raster,
  type Reuse,
  type Role,
  type Shift,
  type Sides,
  type Stage,
  type TextJudgement,
} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import {encloses, expand, readingOrder, union} from '../shared/box.js'

export function createDeltas(input: {
  kinds: DeltaKind[]
  sides: Sides
  geometry: Geometry
  color: ColorMetric
  liveText: LiveTextReader
}): Deltas {
  const {kinds, sides, geometry, color, liveText} = input
  return {
    kinds,
    elements: (request) => elementsOf({...request, geometry}),
    measure: (request) => deltasFor({...request, sides, color, liveText}),
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
  input: Parameters<Deltas['measure']>[0] & {sides: Sides; color: ColorMetric; liveText: LiveTextReader},
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
  sides: Sides
}): Map<Element, {key: string; deltas: Delta[]}> {
  const {elements, reuse, shift, live, target, page, sides} = input
  return new Map(
    elements.map((element): [Element, {key: string; deltas: Delta[]}] => {
      const key = measureKey({element, elements, shift})
      const kept = reuse?.measures.get(key)
      const region = expand({
        box: union([element.liveBox, moved({box: element.liveBox, shift})]),
        by: TOLERANCES.tileSide,
      })
      if (kept !== undefined && reuse !== null && reuse.unchanged(region)) return [element, {key, deltas: kept}]
      const deltas = sides.measure({element, elements, live, target, page, shift})
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
