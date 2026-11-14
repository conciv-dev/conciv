import {formatHex, parse} from 'culori'
import {groupBy, uniqBy} from 'es-toolkit'
import {z} from 'zod'
import type {Ballot, Box, DesignNode, IdNode, LiveComponent, Match, Pairer} from '../../shared/defs.js'
import {box as shapes} from '../../shared/box.js'
import {designConfig} from '../../shared/tolerances.js'
import {walk} from '../../shared/tree.js'
import {layoutVote} from './layout-vote.js'

export function createFigmaNodePairer(): Pairer {
  return (request) => Promise.resolve(pairNodes(request))
}

type Element = {
  id: string
  path: string
  box: Box
  text: string
  kids: number
  img: boolean
  tag: string
  classes: string[]
  cssom: IdNode['cssom'][number] | undefined
  sole: {box: Box; cssom: IdNode['cssom'][number] | undefined} | undefined
  chain: string[]
  ancestors: Set<string>
}

type Node = {node: DesignNode; parent: DesignNode | null; depth: number; box: Box}

type Pick = {path: string; score: number; margin: number; candidates: {path: string; score: number}[]}

type Scored = {path: string; score: number; layers: {dom: number; src: number; cssom: number}}

type Anchor = {node: DesignNode; path: string}

type Vote = {
  elements: Element[]
  byPath: Map<string, Element>
  parents: Map<string, DesignNode | null>
  pairs: Map<string, Pick>
  taken: Set<string>
  holders: Map<string, Set<string>>
  implied: Set<string>
  nodes: Node[]
}

const PAIR = designConfig.tolerances.figmaPair

const SAME_BOX_PX = designConfig.tolerances.geometryPx

const TWIN_MARGIN = designConfig.tolerances.pairMargin

const TIE_SCORE = 0.01

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

const LINE = 'LINE'

const LineFieldsSchema = z.object({strokeWeight: z.number().catch(1)})

const FillsSchema = z.array(z.object({type: z.string(), color: z.string().optional()}))

const LEAF_SHAPES = new Set(['RECTANGLE', 'VECTOR', 'ELLIPSE'])

const IMAGE_TAGS = new Set(['img', 'svg'])

const SVG = 'svg'

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
    pairs: new Map(),
    taken: new Set(),
    holders: new Map(),
    implied: new Set(nodes.flatMap(({node}) => (node.implied === true ? [node.id] : []))),
    nodes,
  }
  input.pins.forEach((pin) =>
    paired({vote, node: pin.node, pick: {path: pin.path, score: 1, margin: 1, candidates: []}}),
  )
  const kept = new Set(
    order.flatMap((entry) => {
      const pin = pinned.get(entry.node.id)
      if (pin === undefined) return []
      if (holds({vote, entry, pin})) return [entry.node.id]
      released({vote, node: entry.node.id, path: pin.path})
      return []
    }),
  )
  const ties = new Map<string, Pick['candidates']>()
  const votes: Ballot[] = []
  order.forEach((entry) => {
    if (kept.has(entry.node.id)) return
    const held = heldText({vote, entry})
    if (held !== null) {
      paired({vote, node: entry.node.id, pick: {...held, candidates: []}})
      return
    }
    const scored = rivals({vote, entry})
    const voted = picked(scored)
    const pick = voted !== null && sharesParent({vote, entry, path: voted.path}) ? null : voted
    const won = pick === null ? null : winning({vote, entry, scored, pick})
    if (won !== null) {
      const painted = paintedTwin({pick: won.pick, scored, byPath, node: entry.node})
      const outer =
        painted === won.pick.path ? outermostTwin({pick: won.pick, scored, byPath, node: entry.node}) : painted
      const path = won.ordered ?? holdingTwin({vote, entry, pick: won.pick, scored, path: outer})
      const chosen = {...won.pick, path}
      paired({vote, node: entry.node.id, pick: chosen})
      votes.push(...ballotsOf({node: entry.node.id, scored, byPath, won: chosen.path}))
      return
    }
    const inherited = sameBoxParent({vote, entry})
    const tied = pick !== null && pick.score >= PAIR.threshold
    if (!tied && inherited === undefined && displaced({vote, entry, offered: scored, votes})) return
    votes.push(...ballotsOf({node: entry.node.id, scored, byPath, won: null}))
    if (tied) ties.set(entry.node.id, pick.candidates)
    if (inherited !== undefined) paired({vote, node: entry.node.id, pick: {...inherited, candidates: []}})
  })
  return {root: matchOf({node: input.design.root, pairs: vote.pairs, ties, lives}), partial: false, votes}
}

function winning(input: {
  vote: Vote
  entry: Node
  scored: Scored[]
  pick: Pick
}): {pick: Pick; ordered: string | null} | null {
  const {vote, scored, pick} = input
  const ordered = orderedTwin(input)
  const within = ordered === null ? TIE_SCORE : 0
  const settled = pick.score >= PAIR.threshold && !tiedApart({pick, scored, byPath: vote.byPath, within})
  return settled ? {pick, ordered} : null
}

function heldText(input: {vote: Vote; entry: Node}): Pick | null {
  const {vote, entry} = input
  if (entry.node.kind !== 'text' || entry.parent === null) return null
  const held = vote.pairs.get(entry.parent.id)
  const element = held === undefined ? undefined : vote.byPath.get(held.path)
  const text = element === undefined ? '' : normalized(element.text)
  if (held === undefined || text === '' || text !== normalized(entry.node.text)) return null
  const nested = vote.elements.some((other) => other.ancestors.has(held.path) && other.text.trim() !== '')
  return nested ? null : held
}

function displaced(input: {vote: Vote; entry: Node; offered: Scored[]; votes: Ballot[]}): boolean {
  const {vote, entry, offered, votes} = input
  const lines = [...walk(entry.node)]
    .flatMap(({node}) => (node.kind === 'text' ? [normalized(node.text)] : []))
    .filter(Boolean)
  const carriers = vote.elements.flatMap((element) => {
    const text = normalized(element.text)
    if (vote.taken.has(element.path) || element.box.w * element.box.h === 0) return []
    if (lines[0] === undefined)
      return pictured(entry.node) && element.img && !claimed({vote, entry, element}) ? [element] : []
    if (entry.node.kind === 'text' || !text.includes(lines[0])) return text === lines[0] ? [element] : []
    const holder = [element.path, ...element.chain].find((path) => holdsAll({vote, path, said: lines})) ?? ''
    const held = vote.byPath.get(holder)
    return held === undefined || vote.taken.has(held.path) ? [] : [held]
  })
  const scored = uniqBy(carriers, (element) => element.path)
    .filter((element) => !offered.some((rival) => rival.path === element.path))
    .flatMap((element) => scoreOf({vote, entry, element, anywhere: true}))
  const pick = picked(scored)
  if (pick === null) return false
  paired({vote, node: entry.node.id, pick})
  votes.push(...ballotsOf({node: entry.node.id, scored, byPath: vote.byPath, won: pick.path}))
  return true
}

function claimed(input: {vote: Vote; entry: Node; element: Element}): boolean {
  const {vote, entry, element} = input
  return vote.nodes.some(
    (other) =>
      other.node !== entry.node &&
      pictured(other.node) &&
      !vote.pairs.has(other.node.id) &&
      scoreOf({vote, entry: other, element}).length > 0,
  )
}

function sameBoxParent(input: {vote: Vote; entry: Node}): Pick | undefined {
  const {vote, entry} = input
  if (entry.parent === null || !sameBox({a: entry.box, b: boxOf(entry.parent)})) return undefined
  return vote.pairs.get(entry.parent.id)
}

function ballotsOf(input: {
  node: string
  scored: Scored[]
  byPath: Map<string, Element>
  won: string | null
}): Ballot[] {
  return input.scored.map((entry) => ({
    node: input.node,
    candidate: input.byPath.get(entry.path)?.id ?? '',
    path: entry.path,
    ...entry.layers,
    total: entry.score,
    won: entry.path === input.won,
  }))
}

function sharesParent(input: {vote: Vote; entry: Node; path: string}): boolean {
  const {vote, entry} = input
  if (entry.node.kind === 'text' || entry.parent === null || !sameBox({a: entry.box, b: boxOf(entry.parent)}))
    return false
  const held = vote.pairs.get(entry.parent.id)?.path
  const parent = held === undefined ? undefined : vote.byPath.get(held)
  const own = vote.byPath.get(input.path)
  if (parent === undefined || own === undefined) return false
  return iou({a: entry.box, b: parent.box}) > iou({a: entry.box, b: own.box})
}

function holds(input: {vote: Vote; entry: Node; pin: Parameters<Pairer>[0]['pins'][number]}): boolean {
  const {vote, entry, pin} = input
  const parentPath = entry.parent === null ? null : (vote.pairs.get(entry.parent.id)?.path ?? null)
  if (parentPath === pin.path) return true
  const element = vote.byPath.get(pin.path)
  const [own] = element === undefined ? [] : scoreOf({vote, entry, element})
  if (own === undefined) return false
  const best = picked(rivals({vote, entry}))
  return best === null || best.score <= own.score + pin.margin
}

function paired(input: {vote: Vote; node: string; pick: Pick}): void {
  const {vote, node, pick} = input
  vote.pairs.set(node, pick)
  vote.taken.add(pick.path)
  vote.holders.set(pick.path, (vote.holders.get(pick.path) ?? new Set()).add(node))
}

function released(input: {vote: Vote; node: string; path: string}): void {
  const {vote, node, path} = input
  vote.pairs.delete(node)
  const left = vote.holders.get(path)
  left?.delete(node)
  if (left === undefined || left.size === 0) vote.taken.delete(path)
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
  const elements = doms.flatMap(({dom, site, cssom}): Element[] => {
    const tag = site.src.element
    const chain = prefixes(dom.path).filter((path) => tags.has(path))
    if (SKIPPED_TAGS.has(tag) || chain.some((path) => tags.get(path) === SVG)) return []
    return [
      {
        id: site.id,
        path: dom.path,
        box: dom.box,
        text: dom.text,
        kids: dom.kids,
        img: IMAGE_TAGS.has(tag) || dom.drawn,
        tag,
        classes: site.src.classes,
        cssom,
        sole: undefined,
        chain,
        ancestors: new Set(chain),
      },
    ]
  })
  const children = groupBy(elements, (element) => element.chain[0] ?? '')
  return elements.map((element) => {
    const [only, ...rest] = children[element.path] ?? []
    return rest.length === 0 && only !== undefined ? {...element, sole: {box: only.box, cssom: only.cssom}} : element
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

function anchorOf(input: {node: DesignNode; vote: Vote; from?: DesignNode}): Anchor | null {
  const from = input.from ?? input.node
  const parent = input.vote.parents.get(input.node.id) ?? null
  if (parent === null) return null
  const path = input.vote.pairs.get(parent.id)?.path
  const contains = holdsChildren({node: {...parent, children: [from]}, box: boxOf(parent)})
  if (path === undefined || !contains || parent.implied === true) return anchorOf({...input, node: parent, from})
  return {node: parent, path}
}

function underAnchor(input: {vote: Vote; element: Element; anchor: Anchor}): boolean {
  if (input.vote.parents.get(input.anchor.node.id) === null || directlyUnder(input)) return true
  const above = twinAbove({vote: input.vote, anchor: input.anchor})
  return above !== null && underAnchor({...input, anchor: above})
}

function twinAbove(input: {vote: Vote; anchor: Anchor}): Anchor | null {
  const parent = input.vote.parents.get(input.anchor.node.id) ?? null
  const path = parent === null ? undefined : input.vote.pairs.get(parent.id)?.path
  if (parent === null || path === undefined || !sameBox({a: boxOf(parent), b: boxOf(input.anchor.node)})) return null
  return {node: parent, path}
}

function directlyUnder(input: {vote: Vote; element: Element; anchor: Anchor}): boolean {
  const {vote, element, anchor} = input
  const real = (path: string): string[] => [...(vote.holders.get(path) ?? [])].filter((node) => !vote.implied.has(node))
  const holder = element.chain.find((path) => real(path).length > 0)
  if (holder === anchor.path) return true
  if (holder === undefined || !element.ancestors.has(anchor.path)) return false
  return real(holder).some((node) => within({vote, node, above: anchor.node.id}))
}

function within(input: {vote: Vote; node: string; above: string}): boolean {
  const parent = input.vote.parents.get(input.node) ?? null
  if (parent === null) return false
  return parent.id === input.above || within({...input, node: parent.id})
}

function scoreOf(input: {vote: Vote; entry: Node; element: Element; anywhere?: boolean}): Scored[] {
  const {vote, entry, element} = input
  const {node, box} = entry
  const shift = shiftOf({node: entry.parent, vote})
  const placed = {...element.box, x: element.box.x + shift.x, y: element.box.y + shift.y}
  const flowed = {...placed, y: placed.y - grownAbove({vote, entry})}
  if (input.anywhere !== true && shapes.outsideWindow({a: box, b: flowed})) return []
  if (node.implied === true && !holdsChildren({node, box: placed})) return []
  if (element.kids === 0 && holdsText(node)) return []
  if (thickerThanLine({node, box, element: element.box})) return []
  const anchor = anchorOf({node, vote})
  if (anchor !== null && !underAnchor({vote, element, anchor})) return []
  const image = pictured(node) && element.img ? PAIR.imageBonus : 0
  const parent = anchor === null ? 0 : PAIR.parentBonus
  const dom = PAIR.overlapWeight * looseOverlap({a: box, b: flowed}) + textualOf({node, element}) + image + parent
  const src = kindOf({node, element}) + PAIR.nameWeight * namedAs({node, element})
  const cssom = layoutVote({node, element})
  return [{path: element.path, score: dom + src + cssom, layers: {dom, src, cssom}}]
}

function thickerThanLine(input: {node: DesignNode; box: Box; element: Box}): boolean {
  const {node, box, element} = input
  if (node.figma?.type !== LINE) return false
  const flat = box.w > box.h
  const across = flat ? element.h - box.h : element.w - box.w
  return across > SAME_BOX_PX
}

function textualOf(input: {node: Node['node']; element: Element}): number {
  const {node, element} = input
  if (node.kind === 'text') {
    const shown = normalized(element.text)
    return PAIR.textWeight * dice({a: normalized(node.text), b: shown}) - (shown === '' ? PAIR.textlessPenalty : 0)
  }
  return LEAF_SHAPES.has(node.figma?.type ?? '') && element.kids === 0 ? PAIR.leafShapeBonus : 0
}

function grownAbove(input: {vote: Vote; entry: Node}): number {
  const {vote, entry} = input
  const siblings = entry.parent?.children ?? []
  return siblings.reduce((total, sibling) => {
    const design = boxOf(sibling)
    const path = vote.pairs.get(sibling.id)?.path
    const element = path === undefined ? undefined : vote.byPath.get(path)
    const above = sibling !== entry.node && design.y + design.h <= entry.box.y + SAME_BOX_PX
    if (element === undefined || !above || sibling.figma?.absolute === true) return total
    return total + element.box.h - design.h
  }, 0)
}

function holdsText(node: DesignNode): boolean {
  const drawn = node.children.filter((child) => child.implied !== true)
  return drawn.length > 1 && drawn.some((child) => child.kind === 'text')
}

function kindOf(input: {node: DesignNode; element: Element}): number {
  const {node, element} = input
  const fit = (yes: boolean): number => (yes ? PAIR.elementKindWeight : -PAIR.elementKindWeight)
  if (node.kind === 'text') return fit(element.text !== '')
  if (pictured(node)) return fit(element.img || (element.kids === 0 && element.text === ''))
  if (node.children.some((child) => child.implied !== true)) return fit(element.kids > 0 || element.text !== '')
  return 0
}

function pictured(node: DesignNode): boolean {
  return node.kind === 'image' || (node.figma?.fields.image === true && node.children.length === 0)
}

function namedAs(input: {node: DesignNode; element: Element}): number {
  const name = normalized(input.node.figma?.name ?? '')
  const typed = normalized(input.node.figma?.type ?? '')
  if (input.node.kind === 'text' || name.split(' ')[0] === typed) return 0
  const tokens = [input.element.tag, ...input.element.classes.flatMap((hint) => [hint, ...normalized(hint).split(' ')])]
  return Math.max(0, ...tokens.map((token) => dice({a: name, b: normalized(token)})))
}

function orderedTwin(input: {vote: Vote; entry: Node; scored: Scored[]; pick: Pick}): string | null {
  const {vote, entry, pick} = input
  if (entry.parent === null || pick.margin > TWIN_MARGIN) return null
  const pair = input.scored
    .filter((scored) => scored.score >= PAIR.threshold && pick.score - scored.score <= TWIN_MARGIN)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 2)
    .toSorted((a, b) => a.path.localeCompare(b.path, 'en', {numeric: true}))
  const placed = entry.parent.children.toSorted((a, b) => shapes.readingOrder({a: boxOf(a), b: boxOf(b)}))
  const twins = placed.filter(
    (sibling) =>
      sibling === entry.node ||
      twinned({vote, entry: {...entry, node: sibling, box: boxOf(sibling)}, pair, type: entry.node.figma?.type}),
  )
  if (pair.length < 2 || twins.length !== 2) return null
  return pair[twins.indexOf(entry.node)]?.path ?? null
}

function twinned(input: {vote: Vote; entry: Node; pair: Scored[]; type: string | undefined}): boolean {
  const {vote, entry} = input
  if (entry.node.kind === 'text' || entry.node.figma?.type !== input.type) return false
  const best = picked(vote.elements.flatMap((element) => scoreOf({vote, entry, element})))
  return best !== null && best.score >= PAIR.threshold && input.pair.some((candidate) => candidate.path === best.path)
}

function paintedTwin(input: {
  pick: Pick
  scored: {path: string; score: number}[]
  byPath: Map<string, Element>
  node: DesignNode
}): string {
  const {pick, byPath} = input
  if (pick.margin > 0 || solidFill(input.node) === null) return pick.path
  const twins = input.scored.filter((entry) => entry.score === pick.score)
  const match = twins.find((entry) => paints({element: byPath.get(entry.path), node: input.node}))
  return match?.path ?? pick.path
}

function paints(input: {element: Element | undefined; node: DesignNode}): boolean {
  const fill = solidFill(input.node)
  const background = parse(input.element?.cssom?.background ?? '')
  return fill !== null && background !== undefined && (background.alpha ?? 1) > 0 && formatHex(background) === fill
}

function outermostTwin(input: {pick: Pick; scored: Scored[]; byPath: Map<string, Element>; node: DesignNode}): string {
  const {pick, byPath, node} = input
  const winner = byPath.get(pick.path)
  if (winner === undefined || node.kind === 'text' || paints({element: winner, node})) return pick.path
  const outer = input.scored
    .flatMap((entry) => {
      const other = byPath.get(entry.path)
      return entry.score >= PAIR.threshold &&
        other !== undefined &&
        winner.ancestors.has(other.path) &&
        sameBox({a: other.box, b: winner.box})
        ? [other]
        : []
    })
    .toSorted((a, b) => a.chain.length - b.chain.length)
  return outer[0]?.path ?? pick.path
}

function holdingTwin(input: {vote: Vote; entry: Node; pick: Pick; scored: Scored[]; path: string}): string {
  const {vote, pick, path} = input
  const texts = [...walk(input.entry.node)].flatMap(({node}) => (node.kind === 'text' ? [normalized(node.text)] : []))
  const said = texts.filter(Boolean)
  if (pick.margin > TWIN_MARGIN || said.length === 0 || holdsAll({vote, path, said})) return path
  const winner = vote.byPath.get(path)
  const holders = input.scored
    .filter(
      (rival) =>
        pick.score - rival.score <= TWIN_MARGIN &&
        winner?.ancestors.has(rival.path) === true &&
        holdsAll({vote, path: rival.path, said}),
    )
    .toSorted((a, b) => (vote.byPath.get(b.path)?.chain.length ?? 0) - (vote.byPath.get(a.path)?.chain.length ?? 0))
  return holders[0]?.path ?? path
}

function holdsAll(input: {vote: Vote; path: string; said: string[]}): boolean {
  const {vote, path} = input
  const held = vote.elements.filter((element) => element.path === path || element.ancestors.has(path))
  const text = normalized(held.map((element) => element.text).join(' '))
  return input.said.every((line) => text.includes(line))
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
  within: number
}): boolean {
  const {pick, byPath, within} = input
  const winner = byPath.get(pick.path)
  if (pick.margin > within || winner === undefined) return false
  return input.scored.some((entry) => {
    const other = byPath.get(entry.path)
    const gap = pick.score - entry.score
    if (gap > within || entry.path === pick.path || other === undefined) return false
    const nested = other.ancestors.has(winner.path) || winner.ancestors.has(other.path)
    return !nested || (gap <= 0 && !sameBox({a: other.box, b: winner.box}))
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
  const box = node.figma?.box ?? node.box
  if (node.figma?.type !== LINE) return box
  const weight = LineFieldsSchema.parse(node.figma.fields).strokeWeight
  const flat = box.h < weight
  const upright = box.w < weight
  return {
    x: upright ? box.x + box.w / 2 - weight / 2 : box.x,
    y: flat ? box.y + box.h / 2 - weight / 2 : box.y,
    w: upright ? weight : box.w,
    h: flat ? weight : box.h,
  }
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

function looseOverlap(input: {a: Box; b: Box}): number {
  return iou({a: shapes.expand({box: input.a, by: SAME_BOX_PX}), b: shapes.expand({box: input.b, by: SAME_BOX_PX})})
}

function iou(input: {a: Box; b: Box}): number {
  const {a, b} = input
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return 0
  const inter = w * h
  return inter / (a.w * a.h + b.w * b.h - inter)
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
  if (left.size + right.size === 0) return 0
  const shared = [...left].filter((pair) => right.has(pair)).length
  return (2 * shared) / (left.size + right.size)
}

function bigrams(text: string): Set<string> {
  return new Set([...text].slice(0, -1).map((char, index) => char + (text[index + 1] ?? '')))
}
