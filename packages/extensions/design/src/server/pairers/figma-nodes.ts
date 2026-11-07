import {formatHex, parse} from 'culori'
import {z} from 'zod'
import type {Box, DesignNode, IdNode, LiveComponent, Match, Pairer} from '../../shared/defs.js'
import {designConfig} from '../../shared/tolerances.js'
import {walk} from '../../shared/tree.js'

export function createFigmaNodePairer(): Pairer {
  return (request) => Promise.resolve(pairNodes(request))
}

type Element = {
  path: string
  box: Box
  text: string
  kids: number
  img: boolean
  tag: string
  classes: string[]
  cssom: IdNode['cssom'][number] | undefined
  chain: string[]
  ancestors: Set<string>
}

type Node = {node: DesignNode; parent: DesignNode | null; depth: number; box: Box}

type Pick = {path: string; score: number; margin: number; candidates: {path: string; score: number}[]}

type Scored = {path: string; score: number}

type Vote = {
  elements: Element[]
  byPath: Map<string, Element>
  parents: Map<string, DesignNode | null>
  pairs: Map<string, Pick>
  taken: Set<string>
}

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

const IMAGE_TAGS = new Set(['img', 'svg'])

const SVG = 'svg'

const FLEX = 'flex'

const GRID = 'grid'

const ROW = 'row'

const HORIZONTAL = 'HORIZONTAL'

const FLOWS = new Set([HORIZONTAL, 'VERTICAL'])

function pairNodes(input: Parameters<Pairer>[0]): Awaited<ReturnType<Pairer>> {
  const elements = elementsOf(input.ids)
  const byPath = new Map(elements.map((element) => [element.path, element]))
  const lives = new Map([...walk(input.measured.live)].map(({node}) => [node.path, node]))
  const nodes = [...walk(input.design.root)].map(({node, parent, depth}) => ({node, parent, depth, box: boxOf(node)}))
  const parents = new Map(nodes.map(({node, parent}) => [node.id, parent]))
  const order = nodes
    .filter(({box}) => box.w > 0 && box.h > 0)
    .toSorted((a, b) => a.depth - b.depth || b.box.w * b.box.h - a.box.w * a.box.h)
  const pinned = new Map(input.pins.map((pin) => [pin.node, pin]))
  const vote: Vote = {
    elements,
    byPath,
    parents,
    pairs: new Map(input.pins.map((pin) => [pin.node, {path: pin.path, score: 1, margin: 1, candidates: []}])),
    taken: new Set(input.pins.map((pin) => pin.path)),
  }
  const ties = new Map<string, Pick['candidates']>()
  order.forEach((entry) => {
    const pin = pinned.get(entry.node.id)
    if (pin !== undefined && holds({vote, entry, pin})) return
    if (pin !== undefined) released({vote, node: entry.node.id, path: pin.path})
    const {pairs, taken} = vote
    const parentPath = entry.parent === null ? null : (pairs.get(entry.parent.id)?.path ?? null)
    const scored = rivals({vote, entry})
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
  return {root: matchOf({node: input.design.root, pairs: vote.pairs, ties, lives}), partial: false}
}

function holds(input: {vote: Vote; entry: Node; pin: Parameters<Pairer>[0]['pins'][number]}): boolean {
  const {vote, entry, pin} = input
  const parentPath = entry.parent === null ? null : (vote.pairs.get(entry.parent.id)?.path ?? null)
  if (parentPath === pin.path) return true
  const element = vote.byPath.get(pin.path)
  const own = element === undefined ? [] : scoreOf({vote, entry, element})
  const best = picked(rivals({vote, entry}))
  return best === null || best.score <= (own[0]?.score ?? 0) + pin.margin
}

function released(input: {vote: Vote; node: string; path: string}): void {
  const {vote, node, path} = input
  vote.pairs.delete(node)
  if (![...vote.pairs.values()].some((pick) => pick.path === path)) vote.taken.delete(path)
}

function rivals(input: {vote: Vote; entry: Node}): Scored[] {
  const {vote, entry} = input
  return vote.elements.flatMap((element) =>
    vote.taken.has(element.path) || element.box.w === 0 || element.box.h === 0 ? [] : scoreOf({vote, entry, element}),
  )
}

function elementsOf(root: IdNode): Element[] {
  const doms = [...walk(root)].flatMap(({node}) =>
    node.dom.map((dom, index) => ({dom, site: node, cssom: node.cssom[index]})),
  )
  const tags = new Map(doms.map(({dom, site}) => [dom.path, site.src.element]))
  return doms.flatMap(({dom, site, cssom}) => {
    const tag = site.src.element
    const chain = prefixes(dom.path).filter((path) => tags.has(path))
    if (SKIPPED_TAGS.has(tag) || chain.some((path) => tags.get(path) === SVG)) return []
    return [
      {
        path: dom.path,
        box: dom.box,
        text: dom.text,
        kids: dom.kids,
        img: IMAGE_TAGS.has(tag) || dom.drawn,
        tag,
        classes: site.src.classes,
        cssom,
        chain,
        ancestors: new Set(chain),
      },
    ]
  })
}

function prefixes(path: string): string[] {
  const steps = path.split('/')
  return steps
    .slice(1, -1)
    .map((_, index) => steps.slice(0, index + 2).join('/'))
    .toReversed()
}

function shiftOf(input: {node: DesignNode | null; vote: Vote}): {x: number; y: number} {
  const {node, vote} = input
  if (node === null) return {x: 0, y: 0}
  const path = vote.pairs.get(node.id)?.path
  const element = path === undefined ? undefined : vote.byPath.get(path)
  if (node.implied === true) return shiftOf({...input, node: vote.parents.get(node.id) ?? null})
  if (element === undefined) return {x: 0, y: 0}
  const design = boxOf(node)
  return {x: design.x - element.box.x, y: design.y - element.box.y}
}

function anchorOf(input: {node: DesignNode; vote: Vote}): string | null {
  const parent = input.vote.parents.get(input.node.id) ?? null
  if (parent === null) return null
  return input.vote.pairs.get(parent.id)?.path ?? anchorOf({...input, node: parent})
}

function scoreOf(input: {vote: Vote; entry: Node; element: Element}): Scored[] {
  const {vote, entry, element} = input
  const {node, box} = entry
  const shift = shiftOf({node: entry.parent, vote})
  const placed = {...element.box, x: element.box.x + shift.x, y: element.box.y + shift.y}
  const geo = iou({a: box, b: placed})
  if (geo < PAIR.overlapFloor && centerDistance({a: box, b: placed}) > PAIR.nearCenterPx) return []
  if (node.implied === true && !holdsChildren({node, box: placed})) return []
  const anchor = anchorOf({node, vote})
  if (anchor !== null && element.chain.find((path) => vote.taken.has(path)) !== anchor) return []
  const typed = node.figma?.type ?? ''
  const text = node.kind === 'text' ? normalized(node.text) : ''
  const shown = normalized(element.text)
  const textual =
    node.kind === 'text'
      ? PAIR.textWeight * dice({a: text, b: shown}) - (shown === '' ? PAIR.textlessPenalty : 0)
      : LEAF_SHAPES.has(typed) && element.kids === 0
        ? PAIR.leafShapeBonus
        : 0
  const image = node.figma?.fields.image === true && element.img ? PAIR.imageBonus : 0
  const parent = anchor === null ? 0 : PAIR.parentBonus
  const dom = PAIR.overlapWeight * geo + textual + image + parent
  const src = kindOf({node, element}) + PAIR.nameWeight * namedAs({node, element})
  return [{path: element.path, score: dom + src + layoutOf({node, element})}]
}

function kindOf(input: {node: DesignNode; element: Element}): number {
  const {node, element} = input
  const fit = (yes: boolean): number => (yes ? PAIR.elementKindWeight : -PAIR.elementKindWeight)
  if (node.kind === 'text') return fit(element.text !== '')
  if (node.kind === 'image' || node.figma?.fields.image === true)
    return fit(element.img || (element.kids === 0 && element.text === ''))
  if (node.children.length > 0) return fit(element.kids > 0 || element.text !== '')
  return 0
}

function namedAs(input: {node: DesignNode; element: Element}): number {
  const name = normalized(input.node.figma?.name ?? '')
  const tokens = [input.element.tag, ...input.element.classes.flatMap((hint) => [hint, ...normalized(hint).split(' ')])]
  return Math.max(0, ...tokens.map((token) => dice({a: name, b: normalized(token)})))
}

function layoutOf(input: {node: DesignNode; element: Element}): number {
  const {node, element} = input
  const {cssom} = element
  if (cssom === undefined) return 0
  const laidOut = cssom.display.includes(FLEX) || cssom.display.includes(GRID)
  const mode = node.figma?.mode ?? null
  if (mode !== null && FLOWS.has(mode)) {
    if (!laidOut) return 0
    const row = cssom.display.includes(FLEX) ? cssom.flexDirection.startsWith(ROW) : (cssom.columns ?? 1) > 1
    return row === (mode === HORIZONTAL) ? PAIR.layoutRoleWeight : -PAIR.layoutRoleWeight
  }
  if (node.kind !== 'text') return 0
  return laidOut && element.kids > 0 ? -PAIR.layoutRoleWeight : PAIR.layoutRoleWeight
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
    const background = parse(byPath.get(entry.path)?.cssom?.background ?? '')
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
  lives: Map<string, LiveComponent>
}): Match {
  const {node, pairs, ties, lives} = input
  const {children, ...own} = node
  const pick = pairs.get(node.id)
  const element = pick === undefined ? undefined : lives.get(pick.path)
  const tied = ties.get(node.id)
  return {
    node: own,
    live: element ?? null,
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
