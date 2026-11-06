import {groupBy, intersection, median, words} from 'es-toolkit'
import {parse} from 'culori'
import type {Box, DesignNode, LiveComponent, Raster} from '../../shared/defs.js'
import {box} from '../../shared/box.js'
import {designConfig} from '../../shared/tolerances.js'
import {walk} from '../../shared/tree.js'

export function createSimilarity() {
  return {
    voters: VOTERS,
    text: {similarity: textSimilarity, shares: sharesWord},
    box: {iou, same: sameBox, apart: edgeDistance},
    views: {design: designViews, live: liveViews, coinciding, inside, enclosing, compatible: elementCompatible},
  }
}

type Rgb = ReturnType<Raster['rgb']>

type Klass = 'heading' | 'text' | 'control' | 'container' | 'media'

type View = {
  key: string
  kind: DesignNode['kind'] | 'element'
  box: Box
  lines: Box[]
  text: string
  words: string
  alone: boolean
  klass: Klass
  ink: number | null
  fill: Rgb | null
  tokens: string[]
  parent: View | null
  rank: number
  media: boolean
}

type Context = {
  assigned: Map<string, View>
  diagonal: number
  nodeRaster: Raster
  candidateRaster: Raster
  hashes: Map<string, Uint8Array>
  twins: Map<string, {path: string; confidence: number}>
  candidates: View[]
  bestText: Map<string, number>
  spoken: Record<string, View[]>
}

type Voter = {
  name: 'text' | 'kind' | 'structure' | 'style' | 'geometry' | 'pixel' | 'hints' | 'twins'
  base: number
  score: (input: {node: View; candidate: View; context: Context}) => number | null
}

type TextNode = Extract<DesignNode, {kind: 'text'}>

type BoxNode = Extract<DesignNode, {kind: 'box'}>

type Held = {node: BoxNode; parent: DesignNode | null; held: DesignNode[]}

type Built = View & {children: View[]}

const TOLERANCES = designConfig.tolerances

const VOTERS: Voter[] = [
  {name: 'text', base: 0.3, score: textVote},
  {name: 'kind', base: 0.1, score: kindVote},
  {name: 'structure', base: 0.2, score: structureVote},
  {name: 'style', base: 0.1, score: styleVote},
  {name: 'geometry', base: 0.2, score: geometryVote},
  {name: 'pixel', base: 0.1, score: pixelVote},
  {name: 'hints', base: 0.1, score: hintsVote},
  {name: 'twins', base: 0.1, score: twinsVote},
]

const INK_SHARE = 0.72
const HEADING_INK = INK_SHARE * 20
const INK_SPREAD = 0.3
const SHORT_TEXT = 6
const GLYPH_RUN_HEIGHT = 14
const MEDIA_TEXT = 0.4
const ORDER = 0.4
const UNDER = 0.6
const PAGE_SHARE = 0.4
const LOCAL_SHARE = 0.6
const LOCAL_REACH = 40
const HASH_SIDE = 8
const HASH_BITS = HASH_SIDE * HASH_SIDE
const HASH_SAMPLES = 4
const STYLE_SPREAD = 3
const CONTROL_HEIGHT = 48
const CONTROL_WIDTH = 320
const CONTROL_WORDS = 4
const OPAQUE_HEX_LENGTH = 7
const MEDIA_TAGS = new Set(['img', 'svg', 'picture', 'video', 'canvas'])
const CONTROL_TAGS = new Set(['button', 'input', 'select', 'textarea'])
const CONTROL_ROLES = new Set(['button', 'link', 'textbox', 'checkbox', 'radio', 'tab', 'menuitem', 'switch'])

function textVote(input: {node: View; candidate: View; context: Context}): number | null {
  const {node, candidate, context} = input
  if (node.kind !== 'text' || node.text === '') return null
  if (node.text.length === 1 && node.box.h < GLYPH_RUN_HEIGHT) return null
  if (candidate.media && box.holds({outer: candidate.box, inner: node.box})) return 1 - bestText({node, context})
  if (candidate.text === '') return 0
  return textSimilarity({a: node.text, b: candidate.text})
}

function bestText(input: {node: View; context: Context}): number {
  const {node, context} = input
  const known = context.bestText.get(node.key)
  if (known !== undefined) return known
  const best = Math.max(
    0,
    ...context.candidates
      .filter((candidate) => candidate.text !== '')
      .map((candidate) => textSimilarity({a: node.text, b: candidate.text})),
  )
  context.bestText.set(node.key, best)
  return best
}

function textSimilarity(input: {a: string; b: string}): number {
  const {a, b} = input
  if (a === b) return 1
  if (Math.min(a.length, b.length) < SHORT_TEXT) return 1 - levenshtein({a, b}) / Math.max(a.length, b.length, 1)
  return dice({a, b})
}

function levenshtein(input: {a: string; b: string}): number {
  const a = [...input.a]
  const b = [...input.b]
  const first = Array.from({length: b.length + 1}, (_, index) => index)
  const last = a.reduce(
    (row, char, i) =>
      row.reduce<number[]>((next, cost, j) => {
        if (j === 0) return [i + 1]
        const replace = (row[j - 1] ?? 0) + (b[j - 1] === char ? 0 : 1)
        return [...next, Math.min(cost + 1, (next[j - 1] ?? 0) + 1, replace)]
      }, []),
    first,
  )
  return last.at(-1) ?? 0
}

function dice(input: {a: string; b: string}): number {
  const left = bigrams(input.a)
  const right = bigrams(input.b)
  if (left.length + right.length === 0) return 0
  const counts = new Map<string, number>()
  left.forEach((gram) => counts.set(gram, (counts.get(gram) ?? 0) + 1))
  const shared = right.filter((gram) => {
    const count = counts.get(gram) ?? 0
    if (count === 0) return false
    counts.set(gram, count - 1)
    return true
  }).length
  return (2 * shared) / (left.length + right.length)
}

function bigrams(text: string): string[] {
  const chars = [...text]
  return chars.slice(1).map((char, index) => `${chars[index] ?? ''}${char}`)
}

function kindVote(input: {node: View; candidate: View}): number | null {
  const {node, candidate} = input
  if (node.klass === candidate.klass) return 1
  if (node.kind === 'text' && candidate.klass === 'media') return MEDIA_TEXT
  return 0
}

function structureVote(input: {node: View; candidate: View; context: Context}): number | null {
  const {node, candidate, context} = input
  const order = ORDER * (1 - Math.abs(node.rank - candidate.rank))
  if (node.parent === null) return UNDER + order
  const anchor = context.assigned.get(node.parent.key)
  if (anchor === undefined) return null
  return (inside({view: candidate, anchor}) ? UNDER : 0) + order
}

function inside(input: {view: View; anchor: View}): boolean {
  if (input.view === input.anchor) return true
  const parent = input.view.parent
  return parent !== null && inside({view: parent, anchor: input.anchor})
}

function styleVote(input: {node: View; candidate: View}): number | null {
  const {node, candidate} = input
  if (node.kind === 'text') {
    if (node.ink === null || candidate.ink === null) return null
    const size = Math.max(node.ink, candidate.ink) / INK_SHARE
    return Math.max(0, 1 - Math.abs(node.ink - candidate.ink) / (INK_SPREAD * size))
  }
  if (node.fill === null || candidate.fill === null) return null
  return Math.max(0, 1 - rgbApart({a: node.fill, b: candidate.fill}) / (TOLERANCES.segmentDistance * STYLE_SPREAD))
}

function rgbApart(input: {a: Rgb; b: Rgb}): number {
  const {a, b} = input
  return Math.hypot(...a.map((channel, index) => channel - (b[index] ?? channel)))
}

function geometryVote(input: {node: View; candidate: View; context: Context}): number | null {
  const {node, candidate, context} = input
  const seen = lineOf({node, candidate})
  const page = box.distance({a: box.centre(node.box), b: box.centre(seen)}) / context.diagonal
  const anchor = node.parent === null ? undefined : context.assigned.get(node.parent.key)
  const nodeOrigin = anchor === undefined || node.parent === null ? {x: 0, y: 0} : node.parent.box
  const candidateOrigin = anchor === undefined ? {x: 0, y: 0} : anchor.box
  const a = box.centre(node.box)
  const b = box.centre(seen)
  const local = box.distance({
    a: {x: a.x - nodeOrigin.x, y: a.y - nodeOrigin.y},
    b: {x: b.x - candidateOrigin.x, y: b.y - candidateOrigin.y},
  })
  return PAGE_SHARE * Math.max(0, 1 - page) + LOCAL_SHARE * Math.max(0, 1 - local / LOCAL_REACH)
}

function lineOf(input: {node: View; candidate: View}): Box {
  const {node, candidate} = input
  if (node.kind !== 'text') return candidate.box
  return box.nearestLine({lines: candidate.lines, box: node.box}) ?? candidate.box
}

function pixelVote(input: {node: View; candidate: View; context: Context}): number | null {
  const {node, candidate, context} = input
  const a = hashed({raster: context.nodeRaster, region: node.box, context, side: 'node'})
  const b = hashed({raster: context.candidateRaster, region: lineOf({node, candidate}), context, side: 'candidate'})
  const differing = a.reduce((sum, bit, index) => sum + (bit === b[index] ? 0 : 1), 0)
  return 1 - differing / HASH_BITS
}

function hashed(input: {raster: Raster; region: Box; context: Context; side: string}): Uint8Array {
  const {raster, region, context} = input
  const key = `${input.side}:${region.x},${region.y},${region.w},${region.h}`
  const known = context.hashes.get(key)
  if (known !== undefined) return known
  const cells = Float64Array.from({length: HASH_BITS}, (_, cell) => cellLuminance({raster, region, cell}))
  const mean = cells.reduce((sum, value) => sum + value, 0) / HASH_BITS
  const made = Uint8Array.from(cells, (value) => (value > mean ? 1 : 0))
  context.hashes.set(key, made)
  return made
}

function cellLuminance(input: {raster: Raster; region: Box; cell: number}): number {
  const {raster, region, cell} = input
  const cx = cell % HASH_SIDE
  const cy = (cell - cx) / HASH_SIDE
  const x0 = Math.max(0, Math.floor(region.x + (cx * region.w) / HASH_SIDE))
  const y0 = Math.max(0, Math.floor(region.y + (cy * region.h) / HASH_SIDE))
  const x1 = Math.min(raster.width, Math.max(x0 + 1, Math.floor(region.x + ((cx + 1) * region.w) / HASH_SIDE)))
  const y1 = Math.min(raster.height, Math.max(y0 + 1, Math.floor(region.y + ((cy + 1) * region.h) / HASH_SIDE)))
  const stepX = Math.max(1, Math.floor((x1 - x0) / HASH_SAMPLES))
  const stepY = Math.max(1, Math.floor((y1 - y0) / HASH_SAMPLES))
  const columns = Math.ceil(Math.max(0, x1 - x0) / stepX)
  const count = columns * Math.ceil(Math.max(0, y1 - y0) / stepY)
  if (count === 0) return 0
  const total = Array.from({length: count}, (_, sample) => {
    const x = x0 + (sample % columns) * stepX
    const y = y0 + Math.floor(sample / columns) * stepY
    const [r, g, b] = raster.rgb(y * raster.width + x)
    return r * 0.299 + g * 0.587 + b * 0.114
  }).reduce((sum, value) => sum + value, 0)
  return total / count
}

function hintsVote(input: {node: View; candidate: View}): number | null {
  const {node, candidate} = input
  if (candidate.tokens.length === 0) return null
  const wanted = new Set([node.klass, ...node.text.split(' ')])
  const matched = candidate.tokens.filter((token) => wanted.has(token)).length
  return matched === 0 ? null : matched / candidate.tokens.length
}

function twinsVote(input: {node: View; candidate: View; context: Context}): number | null {
  const twin = input.context.twins.get(input.node.key)
  return twin === undefined || twin.path !== input.candidate.key ? null : twin.confidence
}

function iou(input: {a: Box; b: Box}): number {
  const {a, b} = input
  const shared = box.intersection({a, b})
  if (shared === null) return 0
  const overlap = box.area(shared)
  return overlap / (box.area(a) + box.area(b) - overlap)
}

function sameBox(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  const edges = [a.x - b.x, a.y - b.y, a.x + a.w - b.x - b.w, a.y + a.h - b.y - b.h]
  return edges.every((edge) => Math.abs(edge) <= TOLERANCES.geometryPx)
}

function coinciding(input: {node: DesignNode; view: View; candidates: View[]; taken: Set<string>}): Map<string, View> {
  const {node, view, taken} = input
  const same = node.children.filter((child) => child.kind !== 'text' && sameBox({a: child.box, b: node.box}))
  if (same.length === 0) return new Map()
  const inner = input.candidates.filter(
    (candidate) =>
      candidate !== view &&
      !taken.has(candidate.key) &&
      sameBox({a: candidate.box, b: view.box}) &&
      inside({view: candidate, anchor: view}),
  )
  const [own = view, ...rest] = [...outer({view, taken}), view, ...inner]
  return new Map([[node.id, own], ...same.map((child, index): [string, View] => [child.id, rest[index] ?? own])])
}

function outer(input: {view: View; taken: Set<string>}): View[] {
  const {view, taken} = input
  const {parent} = view
  if (parent === null || taken.has(parent.key) || !sameBox({a: parent.box, b: view.box})) return []
  return [...outer({view: parent, taken}), parent]
}

function elementCompatible(input: {node: View; candidate: View}): boolean {
  const {node, candidate} = input
  const own = candidate.lines.length > 0 && candidate.text !== ''
  if (node.kind === 'text') return own
  if (node.kind === 'image') return !own
  return true
}

function sharesWord(input: {node: View; candidate: View}): boolean {
  return intersection(input.node.text.split(' '), input.candidate.text.split(' ')).length > 0
}

function enclosing(view: View): View | null {
  const climb = (from: View | null): View | null => {
    if (from === null || from.parent === null) return null
    return box.holds({outer: from.box, inner: view.box}) ? from : climb(from.parent)
  }
  return climb(view.parent)
}

function edgeDistance(input: {a: Box; b: Box}): number {
  const {a, b} = input
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.x + a.w - b.x - b.w) + Math.abs(a.y + a.h - b.y - b.h)
}

function designViews(root: DesignNode): {views: Map<string, View>; holders: Map<string, string>} {
  const held = heldNodes(root)
  const visits = [...walk(root)].filter((visit) => visit.depth > 0)
  const said = groupBy(
    visits.flatMap(({node}) => (node.kind === 'text' ? [spaced(node.text)] : [])),
    (text) => text,
  )
  const controls = new Set(held.flatMap((entry) => (controlBox(entry) ? [entry.node.id] : [])))
  const views = new Map<string, View>()
  visits.forEach(({node, parent, depth}) => {
    const within = depth > 1 ? parent : null
    const siblings = (parent?.children ?? [node]).toSorted((a, b) => box.readingOrder({a: a.box, b: b.box}))
    views.set(node.id, {
      key: node.id,
      kind: node.kind,
      box: node.box,
      lines: [node.box],
      text: node.kind === 'text' ? designConfig.folded(node.text) : '',
      words: node.kind === 'text' ? spaced(node.text) : '',
      alone: node.kind === 'text' && (said[spaced(node.text)] ?? []).length === 1,
      klass: nodeClass({node, within, controls}),
      ink: node.kind === 'text' ? inkHeight(node) : null,
      fill: node.kind === 'box' && node.paint !== undefined ? toRgb(node.paint.background) : null,
      tokens: [],
      parent: within === null ? null : (views.get(within.id) ?? null),
      rank: spread({index: siblings.indexOf(node), count: siblings.length}),
      media: node.kind === 'image',
    })
  })
  return {views, holders: textHolders(held)}
}

function heldNodes(root: DesignNode): Held[] {
  return [...walk(root)].flatMap(({node, parent, depth}): Held[] => {
    if (node.kind !== 'box' || parent === null) return []
    const drawn = parent.children.filter(
      (sibling) => sibling.kind === 'text' && box.holds({outer: node.box, inner: sibling.box}),
    )
    return [{node, parent: depth > 1 ? parent : null, held: [...node.children, ...drawn]}]
  })
}

function textHolders(held: Held[]): Map<string, string> {
  return new Map(
    held.flatMap(({node, held: inner}): [string, string][] => {
      const [only, ...rest] = inner
      return only === undefined || only.kind !== 'text' || rest.length > 0 ? [] : [[node.id, only.id]]
    }),
  )
}

function spread(input: {index: number; count: number}): number {
  return input.count <= 1 ? 0 : input.index / (input.count - 1)
}

function controlBox(input: Held): boolean {
  const {node, parent, held} = input
  if (node.box.h <= CONTROL_HEIGHT && node.box.w <= CONTROL_WIDTH) return true
  const [only, ...rest] = held
  if (only === undefined || only.kind !== 'text' || rest.length > 0) return false
  const short = only.lines.length <= 1 && words(only.text).length <= CONTROL_WORDS
  if (node.box.h <= CONTROL_HEIGHT) return short
  const topLeft = only.box.x - node.box.x <= CONTROL_HEIGHT && only.box.y - node.box.y <= CONTROL_HEIGHT
  return (short || topLeft) && standsOut({node, parent})
}

function standsOut(input: {node: BoxNode; parent: DesignNode | null}): boolean {
  const {node, parent} = input
  if (node.border !== null && node.border.width > 0) return true
  const fill = node.paint === undefined ? null : toRgb(node.paint.background)
  if (fill === null) return false
  const behind = parent?.kind === 'box' && parent.paint !== undefined ? toRgb(parent.paint.background) : null
  if (behind === null) return true
  return rgbApart({a: fill, b: behind}) > TOLERANCES.segmentDistance
}

function nodeClass(input: {node: DesignNode; within: DesignNode | null; controls: Set<string>}): Klass {
  const {node, within, controls} = input
  if (node.kind === 'image') return 'media'
  if (node.kind === 'box') return controls.has(node.id) ? 'control' : 'container'
  if (within !== null && controls.has(within.id)) return 'control'
  return inkHeight(node) >= HEADING_INK ? 'heading' : 'text'
}

function inkHeight(node: TextNode): number {
  const heights = node.lines.map((line) => line.box.h)
  return (heights.length === 0 ? 0 : median(heights)) || node.box.h
}

function spaced(text: string): string {
  return text.split(' ').filter(Boolean).join(' ')
}

function toRgb(color: string): Rgb | null {
  const parsed = parse(color)
  if (parsed === undefined || parsed.mode !== 'rgb') return null
  return [Math.round(parsed.r * 255), Math.round(parsed.g * 255), Math.round(parsed.b * 255)]
}

function liveViews(components: LiveComponent[]): View[] {
  return viewTree({components, parent: null}).filter((view) => !collapsed(view))
}

function viewTree(input: {components: LiveComponent[]; parent: View | null}): Built[] {
  const {components, parent} = input
  return components.flatMap((component, index) => {
    const lines = component.glyphs.flatMap((glyph) => glyph.boxes)
    const said = component.glyphs.map((glyph) => glyph.text).join(' ')
    const view: Built = {
      key: component.path,
      kind: 'element',
      box: component.box,
      lines,
      text: designConfig.folded(said),
      words: spaced(said),
      alone: false,
      klass: elementClass({component, lines}),
      ink: lines.length > 0 ? INK_SHARE * component.styles.fontSize : null,
      fill: opaque(component.styles.background) ? toRgb(component.styles.background) : null,
      tokens: elementTokens(component),
      parent,
      rank: spread({index, count: components.length}),
      media: mediaElement(component),
      children: [],
    }
    const children = viewTree({components: component.children, parent: view})
    view.children = children.filter((child) => child.parent === view)
    return [view, ...children]
  })
}

function opaque(color: string): boolean {
  return color.startsWith('#') && color.length === OPAQUE_HEX_LENGTH
}

function collapsed(view: Built): boolean {
  const [only, ...rest] = view.children
  if (only === undefined || rest.length > 0 || view.lines.length > 0) return false
  return sameBox({a: only.box, b: view.box}) || (only.text !== '' && only.text === view.text)
}

function elementClass(input: {component: LiveComponent; lines: Box[]}): Klass {
  const {component, lines} = input
  if (mediaElement(component)) return 'media'
  if (CONTROL_TAGS.has(component.tag) || CONTROL_ROLES.has(component.role ?? '')) return 'control'
  if (lines.length === 0) return 'container'
  return component.styles.fontSize >= HEADING_INK / INK_SHARE ? 'heading' : 'text'
}

function mediaElement(component: LiveComponent): boolean {
  return MEDIA_TAGS.has(component.tag) || component.placeholder !== null
}

function elementTokens(component: LiveComponent): string[] {
  const stem = component.source?.file.split('/').at(-1)?.split('.')[0] ?? ''
  return [...component.hints, component.role ?? '', stem].flatMap((hint) =>
    words(hint).map((word) => word.toLowerCase()),
  )
}
