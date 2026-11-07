import {formatHex, parse} from 'culori'
import {z} from 'zod'
import type {Box, DesignNode, LiveComponent, Match, Pairer} from '../../shared/defs.js'
import {designConfig} from '../../shared/tolerances.js'
import {walk} from '../../shared/tree.js'

export function createFigmaNodePairer(): Pairer {
  return (request) => Promise.resolve(pairNodes(request))
}

type Element = {
  path: string
  live: LiveComponent
  box: Box
  text: string
  all: string
  kids: number
  img: boolean
  ancestors: Set<string>
}

type Node = {node: DesignNode; parent: DesignNode | null; depth: number; box: Box}

type Pick = {path: string; score: number; margin: number; candidates: {path: string; score: number}[]}

const PAIR = designConfig.tolerances.figmaPair

const SAME_BOX_PX = designConfig.tolerances.geometryPx

const SKIPPED_TAGS = new Set([
  'script',
  'style',
  'path',
  'g',
  'defs',
  'use',
  'lineargradient',
  'stop',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'clippath',
])

const SOLID = 'solid'

const FillsSchema = z.array(z.object({type: z.string(), color: z.string().optional()}))

const LEAF_SHAPES = new Set(['RECTANGLE', 'VECTOR', 'ELLIPSE'])

const INLINE = 'inline'

const IMAGE_TAGS = new Set(['img', 'svg'])

function pairNodes(input: Parameters<Pairer>[0]): Awaited<ReturnType<Pairer>> {
  const elements = elementsOf(input.measured.live)
  const byPath = new Map(elements.map((element) => [element.path, element]))
  const nodes = [...walk(input.design.root)].map(({node, parent, depth}) => ({node, parent, depth, box: boxOf(node)}))
  const parents = new Map(nodes.map(({node, parent}) => [node.id, parent]))
  const order = nodes
    .filter(({box}) => box.w > 0 && box.h > 0)
    .toSorted((a, b) => a.depth - b.depth || b.box.w * b.box.h - a.box.w * a.box.h)
  const pinned = new Map(input.pins.map((pin) => [pin.node, pin.path]))
  const pairs = new Map<string, Pick>(
    input.pins.map((pin) => [pin.node, {path: pin.path, score: 1, margin: 1, candidates: []}]),
  )
  const taken = new Set(input.pins.map((pin) => pin.path))
  const ties = new Map<string, Pick['candidates']>()
  order.forEach((entry) => {
    if (pinned.has(entry.node.id)) return
    const parentPath = entry.parent === null ? null : (pairs.get(entry.parent.id)?.path ?? null)
    const shift = shiftOf({node: entry.parent, parents, pairs, byPath})
    const scored = elements.flatMap((element) =>
      taken.has(element.path) || element.box.w === 0 || element.box.h === 0
        ? []
        : scoreOf({
            entry,
            element,
            parentPath,
            box: {...element.box, x: element.box.x + shift.x, y: element.box.y + shift.y},
          }),
    )
    const pick = picked(scored)
    if (pick !== null && pick.score >= PAIR.threshold && !tiedApart({pick, scored, byPath})) {
      const chosen = {...pick, path: paintedTwin({pick, scored, byPath, node: entry.node})}
      pairs.set(entry.node.id, chosen)
      taken.add(chosen.path)
      return
    }
    if (pick !== null && pick.score >= PAIR.threshold) ties.set(entry.node.id, pick.candidates)
    if (entry.parent === null || parentPath === null || !sameBox({a: entry.box, b: boxOf(entry.parent)})) return
    const parentPick = pairs.get(entry.parent.id)
    if (parentPick !== undefined) pairs.set(entry.node.id, {...parentPick, candidates: []})
  })
  return {root: matchOf({node: input.design.root, pairs, ties, byPath}), partial: false}
}

function elementsOf(live: LiveComponent): Element[] {
  return live.children.flatMap((child) => collected({live: child, ancestors: []}))
}

function collected(input: {live: LiveComponent; ancestors: string[]}): Element[] {
  const {live} = input
  const tag = live.tag.toLowerCase()
  if (SKIPPED_TAGS.has(tag)) return []
  const below = tag === 'svg' ? [] : live.children
  const children = below.flatMap((child) => collected({live: child, ancestors: [...input.ancestors, live.path]}))
  const own: Element = {
    path: live.path,
    live,
    box: rounded(live.bounds),
    text: ownText(live),
    all: allText(live),
    kids: live.children.length,
    img: IMAGE_TAGS.has(tag) || live.drawn || live.styles.gradient !== null,
    ancestors: new Set(input.ancestors),
  }
  return [own, ...children]
}

function ownText(live: LiveComponent): string {
  if (live.text !== '' || live.children.length === 0) return live.text
  return live.children.every((child) => child.styles.display === INLINE) ? allText(live) : ''
}

function allText(live: LiveComponent): string {
  return [live.text, ...live.children.map(allText)].filter(Boolean).join(' ')
}

function shiftOf(input: {
  node: DesignNode | null
  parents: Map<string, DesignNode | null>
  pairs: Map<string, Pick>
  byPath: Map<string, Element>
}): {x: number; y: number} {
  const {node, parents, pairs, byPath} = input
  if (node === null) return {x: 0, y: 0}
  const path = pairs.get(node.id)?.path
  const element = path === undefined ? undefined : byPath.get(path)
  if (node.implied === true) return shiftOf({...input, node: parents.get(node.id) ?? null})
  if (element === undefined) return {x: 0, y: 0}
  const design = boxOf(node)
  return {x: design.x - element.box.x, y: design.y - element.box.y}
}

function scoreOf(input: {
  entry: Node
  element: Element
  parentPath: string | null
  box: Box
}): {path: string; score: number}[] {
  const {entry, element, parentPath} = input
  const {node, box} = entry
  const geo = iou({a: box, b: input.box})
  if (geo < PAIR.overlapFloor && centerDistance({a: box, b: input.box}) > PAIR.nearCenterPx) return []
  if (node.implied === true && !holdsChildren({node, box: input.box})) return []
  const typed = node.figma?.type ?? ''
  const text = node.kind === 'text' ? normalized(node.text) : ''
  const shown = normalized(element.text)
  const textual =
    node.kind === 'text'
      ? PAIR.textWeight * dice({a: text, b: shown}) - (shown === '' ? PAIR.textlessPenalty : 0)
      : (element.text !== '' && element.all === '' ? -PAIR.textHolderPenalty : 0) +
        (LEAF_SHAPES.has(typed) && element.kids === 0 ? PAIR.leafShapeBonus : 0)
  const image = node.figma?.fields.image === true && element.img ? PAIR.imageBonus : 0
  const parent =
    parentPath === null
      ? 0
      : element.ancestors.has(parentPath) || element.path === parentPath
        ? PAIR.parentBonus
        : -PAIR.parentPenalty
  return [{path: element.path, score: PAIR.overlapWeight * geo + textual + image + parent}]
}

function paintedTwin(input: {
  pick: Pick
  scored: {path: string; score: number}[]
  byPath: Map<string, Element>
  node: DesignNode
}): string {
  const {pick, byPath} = input
  const fill = solidFill(input.node)
  if (pick.margin > 0 || fill === null) return pick.path
  const twins = input.scored.filter((entry) => entry.score === pick.score)
  const match = twins.find((entry) => {
    const background = parse(byPath.get(entry.path)?.live.styles.background ?? '')
    return background !== undefined && (background.alpha ?? 1) > 0 && formatHex(background) === fill
  })
  return match?.path ?? pick.path
}

function solidFill(node: DesignNode): string | null {
  const fills = FillsSchema.safeParse(node.figma?.fields.fills)
  if (!fills.success || fills.data.length !== 1) return null
  const [fill] = fills.data
  const parsed = fill?.type === SOLID && fill.color !== undefined ? parse(fill.color) : undefined
  return parsed === undefined ? null : formatHex(parsed)
}

function tiedApart(input: {
  pick: Pick
  scored: {path: string; score: number}[]
  byPath: Map<string, Element>
}): boolean {
  const {pick, byPath} = input
  const winner = byPath.get(pick.path)
  if (pick.margin > 0 || winner === undefined) return false
  return input.scored.some((entry) => {
    const other = byPath.get(entry.path)
    if (entry.score < pick.score || entry.path === pick.path || other === undefined) return false
    const nested = other.ancestors.has(winner.path) || winner.ancestors.has(other.path)
    return !nested || !sameBox({a: other.box, b: winner.box})
  })
}

function holdsChildren(input: {node: DesignNode; box: Box}): boolean {
  const {box} = input
  return input.node.children.every((child) => {
    const own = boxOf(child)
    const x = own.x + own.w / 2
    const y = own.y + own.h / 2
    return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h
  })
}

function picked(scored: {path: string; score: number}[]): Pick | null {
  const best = scored.reduce<{best: {path: string; score: number} | null; second: number}>(
    (found, entry) => {
      if (entry.score > (found.best?.score ?? 0)) return {best: entry, second: found.best?.score ?? 0}
      return entry.score > found.second ? {best: found.best, second: entry.score} : found
    },
    {best: null, second: 0},
  )
  if (best.best === null) return null
  const candidates = scored.toSorted((a, b) => b.score - a.score).slice(0, PAIR.candidatesKept)
  return {path: best.best.path, score: best.best.score, margin: best.best.score - best.second, candidates}
}

function matchOf(input: {
  node: DesignNode
  pairs: Map<string, Pick>
  ties: Map<string, Pick['candidates']>
  byPath: Map<string, Element>
}): Match {
  const {node, pairs, ties, byPath} = input
  const {children, ...own} = node
  const pick = pairs.get(node.id)
  const element = pick === undefined ? undefined : byPath.get(pick.path)
  const tied = ties.get(node.id)
  return {
    node: own,
    live: element === undefined ? null : element.live,
    hash: '',
    confidence: pick?.score ?? 0,
    ...(pick === undefined ? {} : {margin: pick.margin}),
    ...(tied === undefined || element !== undefined ? {} : {candidates: tied}),
    children: children.map((child) => matchOf({...input, node: child})),
  }
}

function boxOf(node: DesignNode): Box {
  return node.figma?.box ?? node.box
}

function sameBox(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  return (
    Math.abs(a.x - b.x) <= SAME_BOX_PX &&
    Math.abs(a.y - b.y) <= SAME_BOX_PX &&
    Math.abs(a.w - b.w) <= SAME_BOX_PX &&
    Math.abs(a.h - b.h) <= SAME_BOX_PX
  )
}

function rounded(box: Box): Box {
  return {x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h)}
}

function iou(input: {a: Box; b: Box}): number {
  const {a, b} = input
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return 0
  const inter = w * h
  return inter / (a.w * a.h + b.w * b.h - inter)
}

function centerDistance(input: {a: Box; b: Box}): number {
  const {a, b} = input
  return Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2)
}

function normalized(text: string): string {
  return [...text.toLowerCase()]
    .map((char) => ((char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') ? char : ' '))
    .join('')
    .split(' ')
    .filter(Boolean)
    .join(' ')
}

function dice(input: {a: string; b: string}): number {
  const {a, b} = input
  if (a === '' || b === '') return 0
  if (a === b) return 1
  const left = bigrams(a)
  const right = bigrams(b)
  const shared = [...left].filter((pair) => right.has(pair)).length
  return (2 * shared) / (left.size + right.size)
}

function bigrams(text: string): Set<string> {
  return new Set([...text].slice(0, -1).map((char, index) => char + (text[index + 1] ?? '')))
}
