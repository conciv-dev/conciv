import {median, words} from 'es-toolkit'
import {parse} from 'culori'
import {SOURCE_ATTR, TOLERANCES, type Tolerances} from '../shared/tolerances.js'
import type {
  Box,
  Item,
  LiveComponent,
  Matched,
  MeasureSource,
  Pair,
  Pairer,
  Ranker,
  Raster,
  TargetModel,
  TargetNode,
  TextNode,
  TwinPair,
  TwinVote,
} from '../shared/types.js'
import {expand, sameLine, trimToInk, type Rgb} from './raster.js'

export const PAIRERS = {vote: votePairer} as const satisfies Record<string, Pairer>

export const RANKERS = {impact: impactRanker} as const satisfies Record<string, Ranker>

export type Shift = {dx: number; dy: number}

export type Offset = {pair: Pair | null; shift: Shift}

export function pairTwins(input: {a: TargetModel; b: TargetModel; tolerances: Tolerances}): TwinPair[] {
  const {a, b, tolerances} = input
  const nodes = nodeViews(a.nodes)
  const candidates = nodeViews(b.nodes)
  const result = runVote({
    nodes,
    candidates,
    voters: VOTERS.filter((voter) => voter.name !== 'geometry'),
    compatible: ({node, candidate}) => node.kind === candidate.kind,
    gate: oneToOne,
    context: emptyContext({nodeRaster: a.raster, candidateRaster: b.raster, candidates, twinVotes: []}),
    pins: [],
    tolerances,
    deadline: Number.POSITIVE_INFINITY,
  })
  return result.matched.map(({node, candidate, score}) => ({node: node.key, twin: candidate.key, confidence: score}))
}

export function pairTree(input: {
  matched: Matched[]
  components: LiveComponent[]
  live: Raster
  source: MeasureSource
  mismatchAt: (box: Box) => number
}): Pair[] {
  const {matched, live, source, mismatchAt} = input
  const byPath = Map.groupBy(matched, (entry) => entry.component.path)
  return grow({components: input.components, parent: null, host: null, depth: 1, byPath, live, source, mismatchAt})
}

export function align(input: {pairs: Pair[]; live: Raster; tolerances: Tolerances}): {
  global: Shift
  offsets: Offset[]
} {
  const {pairs, live, tolerances} = input
  const shifts = pairs.flatMap((pair) => pair.texts.map((node) => inkShift({pair, node, live})))
  const global = {dx: median0(shifts.map((shift) => shift.dx)), dy: median0(shifts.map((shift) => shift.dy))}
  const moved = (pair: Pair): Shift => relative({a: displacement(pair), b: global})
  const own = (pair: Pair): Shift =>
    pair.parent === null ? moved(pair) : relative({a: moved(pair), b: moved(pair.parent)})
  const containers = pairs.flatMap((pair): Offset[] => {
    const shift = sharedShift({pair, pairs, own, tolerances})
    return shift === null ? [] : [{pair, shift}]
  })
  const shared = new Set(containers.map((offset) => offset.pair))
  const loose = pairs.flatMap((pair): Offset[] => {
    if (pair.parent !== null && shared.has(pair.parent)) return []
    const shift = own(pair)
    return beyond({shift, tolerances}) ? [{pair, shift}] : []
  })
  const page: Offset[] = beyond({shift: global, tolerances}) ? [{pair: null, shift: global}] : []
  return {global, offsets: [...page, ...containers, ...loose]}
}

function inkShift(input: {pair: Pair; node: TextNode; live: Raster}): Shift {
  const {pair, node, live} = input
  const line = nearestLine({lines: pair.live.glyphs.flatMap((glyph) => glyph.boxes), box: node.box})
  if (line === null) return {dx: 0, dy: 0}
  const ink = trimToInk({raster: live, box: line})
  return {dx: node.box.x - ink.x, dy: node.box.y - ink.y}
}

type KindClass = 'heading' | 'text' | 'control' | 'container' | 'media'

type View = {
  key: string
  kind: 'text' | 'box' | 'image' | 'element'
  box: Box
  lines: Box[]
  text: string
  klass: KindClass
  ink: number | null
  fill: Rgb | null
  tokens: string[]
  parent: View | null
  rank: number
  media: boolean
}

type Votes = Record<VoterName, number | null>

type Scored = {candidate: View; score: number; votes: Votes}

type Context = {
  assigned: Map<string, View>
  diagonal: number
  nodeRaster: Raster
  candidateRaster: Raster
  hashes: Map<string, Uint8Array>
  twinVotes: Map<string, TwinVote>
  candidates: View[]
  bestText: Map<string, number>
}

type VoterName = 'text' | 'kind' | 'structure' | 'style' | 'geometry' | 'pixel' | 'hints' | 'twins'

type Voter = {
  name: VoterName
  base: number
  score: (input: {node: View; candidate: View; context: Context}) => number | null
}

type State = {boxes: Set<string>; texts: Map<string, Box[]>; trusted: Set<VoterName>}

type Gate = (input: {node: View; candidate: View; state: State; tolerances: Tolerances}) => boolean

type VoteInput = {
  nodes: View[]
  candidates: View[]
  voters: Voter[]
  compatible: (input: {node: View; candidate: View}) => boolean
  gate: Gate
  context: Context
  pins: {node: string; path: string}[]
  tolerances: Tolerances
  deadline: number
}

type Assignment = {node: View; candidate: View; score: number}

const CONTROL_HEIGHT = 48
const CONTROL_WIDTH = 320
const HEADING_INK = 0.72 * 20
const INK_SHARE = 0.72
const INK_SPREAD = 0.3
const SHORT_TEXT = 6
const GLYPH_RUN_HEIGHT = 14
const MEDIA_TEXT = 0.4
const UNDER = 0.6
const ORDER = 0.4
const PAGE_SHARE = 0.4
const LOCAL_SHARE = 0.6
const LOCAL_REACH = 40
const X_WEIGHT = 0.5
const HASH_SIDE = 8
const HASH_BITS = HASH_SIDE * HASH_SIDE
const HASH_SAMPLES = 4
const STYLE_SPREAD = 3
const TIE = 1e-9
const OPAQUE_HEX_LENGTH = 7
const MEDIA_TAGS = new Set(['img', 'svg', 'picture', 'video', 'canvas'])
const CONTROL_TAGS = new Set(['button', 'input', 'select', 'textarea'])
const CONTROL_ROLES = new Set(['button', 'link', 'textbox', 'checkbox', 'radio', 'tab', 'menuitem', 'switch'])

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

function votePairer(input: Parameters<Pairer>[0]): ReturnType<Pairer> {
  const nodes = nodeViews(input.nodes)
  const candidates = elementViews(input.components)
  const result = runVote({
    nodes,
    candidates,
    voters: VOTERS,
    compatible: elementCompatible,
    gate: elementGate,
    context: emptyContext({
      nodeRaster: input.target,
      candidateRaster: input.live,
      candidates,
      twinVotes: input.twinVotes,
    }),
    pins: input.pins,
    tolerances: input.tolerances,
    deadline: input.deadline,
  })
  const components = new Map(flatten(input.components).map((component) => [component.path, component]))
  const targets = new Map(input.nodes.map((node) => [node.id, node]))
  const matched = result.matched.flatMap(({node, candidate, score}): Matched[] => {
    const component = components.get(candidate.key)
    const target = targets.get(node.key)
    return component === undefined || target === undefined ? [] : [{node: target, component, confidence: score}]
  })
  return {matched, partial: result.partial}
}

function impactRanker(input: {items: Item[]}): Item[] {
  return input.items.toSorted(
    (a, b) => b.confidence * b.size - a.confidence * a.size || a.box.y - b.box.y || a.depth - b.depth,
  )
}

function nodeViews(nodes: TargetNode[]): View[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const ranks = siblingRanks(nodes)
  const views = new Map<string, View>()
  const view = (node: TargetNode): View => {
    const found = views.get(node.id)
    if (found !== undefined) return found
    const within = node.within === undefined ? undefined : byId.get(node.within)
    const made: View = {
      key: node.id,
      kind: node.kind,
      box: node.box,
      lines: [node.box],
      text: node.kind === 'text' ? folded(node.text) : '',
      klass: nodeClass({node, within}),
      ink: node.kind === 'text' ? inkHeight(node) : null,
      fill: node.kind === 'box' && node.paint !== undefined ? toRgb(node.paint.background) : null,
      tokens: [],
      parent: within === undefined ? null : view(within),
      rank: ranks.get(node.id) ?? 0,
      media: node.kind === 'image',
    }
    views.set(node.id, made)
    return made
  }
  return nodes.map(view)
}

function siblingRanks(nodes: TargetNode[]): Map<string, number> {
  const groups = Map.groupBy(nodes, (node) => node.within ?? '')
  return new Map(
    [...groups.values()].flatMap((group) => {
      const ordered = group.toSorted((a, b) => readingOrder(a.box, b.box))
      return ordered.map((node, index): [string, number] => [node.id, spread({index, count: ordered.length})])
    }),
  )
}

function readingOrder(a: Box, b: Box): number {
  if (sameLine({a, b})) return a.x - b.x
  return a.y - b.y
}

function spread(input: {index: number; count: number}): number {
  return input.count <= 1 ? 0 : input.index / (input.count - 1)
}

function nodeClass(input: {node: TargetNode; within: TargetNode | undefined}): KindClass {
  const {node, within} = input
  if (node.kind === 'image') return 'media'
  if (node.kind === 'box') return controlSized(node.box) ? 'control' : 'container'
  if (within !== undefined && within.kind === 'box' && controlSized(within.box)) return 'control'
  return inkHeight(node) >= HEADING_INK ? 'heading' : 'text'
}

function controlSized(box: Box): boolean {
  return box.h <= CONTROL_HEIGHT && box.w <= CONTROL_WIDTH
}

function inkHeight(node: TextNode): number {
  return median0(node.lines.map((line) => line.box.h)) || node.box.h
}

function folded(text: string): string {
  return text.toLowerCase().split(' ').filter(Boolean).join(' ').trim()
}

function toRgb(color: string): Rgb | null {
  const parsed = parse(color)
  if (parsed === undefined || parsed.mode !== 'rgb') return null
  return [Math.round(parsed.r * 255), Math.round(parsed.g * 255), Math.round(parsed.b * 255)]
}

function elementViews(components: LiveComponent[]): View[] {
  return viewTree({components, parent: null}).filter((view) => !collapsed(view))
}

type Built = View & {children: View[]}

function viewTree(input: {components: LiveComponent[]; parent: View | null}): Built[] {
  const {components, parent} = input
  return components.flatMap((component, index) => {
    const lines = component.glyphs.flatMap((glyph) => glyph.boxes)
    const view: Built = {
      key: component.path,
      kind: 'element',
      box: component.box,
      lines,
      text: folded(component.glyphs.map((glyph) => glyph.text).join(' ')),
      klass: elementClass({component, lines}),
      ink: lines.length > 0 ? INK_SHARE * component.styles.fontSize : null,
      fill: opaque(component.styles.background) ? toRgb(component.styles.background) : null,
      tokens: elementTokens(component),
      parent,
      rank: spread({index, count: components.length}),
      media: MEDIA_TAGS.has(component.tag),
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

function sameBox(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  const edges = [a.x - b.x, a.y - b.y, a.x + a.w - b.x - b.w, a.y + a.h - b.y - b.h]
  return edges.every((edge) => Math.abs(edge) <= TOLERANCES.geometryPx)
}

function elementClass(input: {component: LiveComponent; lines: Box[]}): KindClass {
  const {component, lines} = input
  if (MEDIA_TAGS.has(component.tag)) return 'media'
  if (CONTROL_TAGS.has(component.tag) || CONTROL_ROLES.has(component.role ?? '')) return 'control'
  if (lines.length === 0) return 'container'
  return component.styles.fontSize >= HEADING_INK / INK_SHARE ? 'heading' : 'text'
}

function elementTokens(component: LiveComponent): string[] {
  const stem = component.source?.file.split('/').at(-1)?.split('.')[0] ?? ''
  return [...component.hints, component.role ?? '', stem].flatMap((hint) =>
    words(hint).map((word) => word.toLowerCase()),
  )
}

function flatten(components: LiveComponent[]): LiveComponent[] {
  return components.flatMap((component) => [component, ...flatten(component.children)])
}

function emptyContext(input: {
  nodeRaster: Raster
  candidateRaster: Raster
  candidates: View[]
  twinVotes: TwinVote[]
}): Context {
  const {nodeRaster} = input
  return {
    assigned: new Map(),
    diagonal: Math.hypot(nodeRaster.width, nodeRaster.height) || 1,
    nodeRaster,
    candidateRaster: input.candidateRaster,
    hashes: new Map(),
    twinVotes: new Map(input.twinVotes.map((vote) => [vote.node, vote])),
    candidates: input.candidates,
    bestText: new Map(),
  }
}

function elementCompatible(input: {node: View; candidate: View}): boolean {
  const {node, candidate} = input
  if (node.kind !== 'text') return true
  return candidate.lines.length > 0 || candidate.media
}

function elementGate(input: {node: View; candidate: View; state: State; tolerances: Tolerances}): boolean {
  const {node, candidate, state, tolerances} = input
  if (node.kind !== 'text') {
    if (state.boxes.has(candidate.key)) return false
    const area =
      Math.max(area0(node.box), area0(candidate.box)) / Math.max(1, Math.min(area0(node.box), area0(candidate.box)))
    return iou({a: node.box, b: candidate.box}) >= tolerances.pairBoxIou && area < tolerances.pairBoxArea
  }
  const reach = expand({box: candidate.box, by: tolerances.tileMargin})
  if (state.trusted.has('geometry') && !holds({outer: reach, inner: node.box})) return false
  const held = state.texts.get(candidate.key)
  return held === undefined || holds({outer: reach, inner: node.box})
}

function oneToOne(input: {node: View; candidate: View; state: State}): boolean {
  return !input.state.boxes.has(input.candidate.key)
}

function area0(box: Box): number {
  return Math.max(0, box.w) * Math.max(0, box.h)
}

function iou(input: {a: Box; b: Box}): number {
  const {a, b} = input
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return 0
  const shared = w * h
  return shared / (area0(a) + area0(b) - shared)
}

function holds(input: {outer: Box; inner: Box}): boolean {
  const {outer, inner} = input
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

function runVote(input: VoteInput): {matched: Assignment[]; partial: boolean} {
  const weights = calibrate(input)
  const trusted = new Set(
    input.voters.filter((voter) => (weights.get(voter.name) ?? 0) >= voter.base / 2).map((voter) => voter.name),
  )
  const state: State = {boxes: new Set(), texts: new Map(), trusted}
  const pools = new Map(
    input.nodes.map((node) => [
      node.key,
      median0(candidatePool({input, node}).map((candidate) => weighed({input, weights, node, candidate}).score)),
    ]),
  )
  const pinned = pinsFirst({input, state})
  const lists = new Map(
    input.nodes
      .filter((node) => !input.context.assigned.has(node.key))
      .map((node) => [node.key, scoredList({input, weights, state, node})]),
  )
  const views = new Map(input.nodes.map((node) => [node.key, node]))
  return greedy({input, weights, state, pools, lists, views, matched: pinned})
}

function calibrate(input: VoteInput): Map<VoterName, number> {
  const base = new Map(input.voters.map((voter) => [voter.name, voter.base]))
  const tallies = input.nodes.flatMap((node) => {
    const pool = candidatePool({input, node}).map((candidate) => weighed({input, weights: base, node, candidate}))
    const consensus = pool.reduce<Scored | null>(
      (best, entry) => (best === null || entry.score > best.score ? entry : best),
      null,
    )
    if (consensus === null) return []
    return input.voters.flatMap((voter) => {
      const own = pool.filter((entry) => entry.votes[voter.name] !== null)
      if (own.length === 0 || consensus.votes[voter.name] === null) return []
      const top = Math.max(...own.map((entry) => entry.votes[voter.name] ?? 0))
      const agrees = (consensus.votes[voter.name] ?? 0) >= top - TIE
      return [{name: voter.name, agrees}]
    })
  })
  const byVoter = Map.groupBy(tallies, (tally) => tally.name)
  return new Map(
    input.voters.map((voter) => {
      const tally = byVoter.get(voter.name)
      if (tally === undefined) return [voter.name, voter.base]
      const agreement = tally.filter((entry) => entry.agrees).length / tally.length
      return [voter.name, voter.base * Math.max(input.tolerances.pairMinWeight, agreement)]
    }),
  )
}

function candidatePool(input: {input: VoteInput; node: View}): View[] {
  return input.input.candidates.filter((candidate) => input.input.compatible({node: input.node, candidate}))
}

function weighed(input: {input: VoteInput; weights: Map<VoterName, number>; node: View; candidate: View}): Scored {
  const {node, candidate, weights} = input
  const {context, voters} = input.input
  const votes = Object.fromEntries(voters.map((voter) => [voter.name, voter.score({node, candidate, context})]))
  const applied = voters.filter((voter) => votes[voter.name] !== null && votes[voter.name] !== undefined)
  const total = applied.reduce((sum, voter) => sum + (weights.get(voter.name) ?? 0), 0)
  const sum = applied.reduce((acc, voter) => acc + (weights.get(voter.name) ?? 0) * (votes[voter.name] ?? 0), 0)
  return {candidate, score: total === 0 ? 0 : sum / total, votes: completeVotes(votes)}
}

function completeVotes(votes: Record<string, number | null | undefined>): Votes {
  return {
    text: votes['text'] ?? null,
    kind: votes['kind'] ?? null,
    structure: votes['structure'] ?? null,
    style: votes['style'] ?? null,
    geometry: votes['geometry'] ?? null,
    pixel: votes['pixel'] ?? null,
    hints: votes['hints'] ?? null,
    twins: votes['twins'] ?? null,
  }
}

function pinsFirst(input: {input: VoteInput; state: State}): Assignment[] {
  const {state} = input
  const {nodes, candidates, context} = input.input
  return input.input.pins.flatMap((pin) => {
    const node = nodes.find((view) => view.key === pin.node)
    const candidate = candidates.find((view) => view.key === pin.path)
    if (node === undefined || candidate === undefined) return []
    take({node, candidate, state, context})
    return [{node, candidate, score: 1}]
  })
}

function take(input: {node: View; candidate: View; state: State; context: Context}): void {
  const {node, candidate, state, context} = input
  context.assigned.set(node.key, candidate)
  if (node.kind !== 'text') {
    state.boxes.add(candidate.key)
    return
  }
  state.texts.set(candidate.key, [...(state.texts.get(candidate.key) ?? []), node.box])
}

function scoredList(input: {input: VoteInput; weights: Map<VoterName, number>; state: State; node: View}): Scored[] {
  const {node, state, weights} = input
  const {tolerances, gate} = input.input
  return candidatePool({input: input.input, node})
    .filter((candidate) => gate({node, candidate, state, tolerances}))
    .map((candidate) => weighed({input: input.input, weights, node, candidate}))
    .toSorted((a, b) => b.score - a.score)
}

function greedy(input: {
  input: VoteInput
  weights: Map<VoterName, number>
  state: State
  pools: Map<string, number>
  lists: Map<string, Scored[]>
  views: Map<string, View>
  matched: Assignment[]
}): {matched: Assignment[]; partial: boolean} {
  const {state, pools, lists, weights, views} = input
  const {context, nodes, tolerances, gate, deadline} = input.input
  if (Date.now() > deadline) return {matched: input.matched, partial: true}
  const ready = [...lists.entries()].flatMap(([key, list]) => {
    const node = views.get(key)
    if (node === undefined) return []
    const top = list[0]
    if (top === undefined || !passes({list, floor: pools.get(key) ?? 0, state, tolerances})) return []
    return [{node, top}]
  })
  const best = ready.reduce<(typeof ready)[number] | null>(
    (found, entry) => (found === null || entry.top.score > found.top.score ? entry : found),
    null,
  )
  if (best === null) return {matched: input.matched, partial: false}
  const {node, top} = best
  take({node, candidate: top.candidate, state, context})
  lists.delete(node.key)
  const below = new Set(nodes.filter((view) => descends({view, from: node})).map((view) => view.key))
  lists.forEach((list, key) => {
    const other = views.get(key)
    if (other === undefined) return
    if (below.has(key)) {
      lists.set(key, scoredList({input: input.input, weights, state, node: other}))
      return
    }
    if (!list.some((entry) => entry.candidate === top.candidate)) return
    lists.set(
      key,
      list.filter(
        (entry) =>
          entry.candidate !== top.candidate || gate({node: other, candidate: entry.candidate, state, tolerances}),
      ),
    )
  })
  return greedy({...input, matched: [...input.matched, {node, candidate: top.candidate, score: top.score}]})
}

function descends(input: {view: View; from: View}): boolean {
  const parent = input.view.parent
  if (parent === null) return false
  return parent === input.from || descends({view: parent, from: input.from})
}

function passes(input: {list: Scored[]; floor: number; state: State; tolerances: Tolerances}): boolean {
  const {list, floor, state, tolerances} = input
  const [top, runner] = list
  if (top === undefined) return false
  if (top.score < tolerances.pairFloor || top.score < floor + tolerances.pairFloorMargin) return false
  if (runner === undefined || top.score - runner.score >= tolerances.pairMargin) return true
  return dominates({top, runner, trusted: state.trusted, tolerances})
}

function dominates(input: {top: Scored; runner: Scored; trusted: Set<VoterName>; tolerances: Tolerances}): boolean {
  const {top, runner, trusted, tolerances} = input
  const shared = [...trusted].flatMap((name) => {
    const a = top.votes[name]
    const b = runner.votes[name]
    return a === null || b === null ? [] : [a - b]
  })
  return shared.every((gap) => gap >= 0) && shared.some((gap) => gap >= tolerances.pairDominance)
}

function textVote(input: {node: View; candidate: View; context: Context}): number | null {
  const {node, candidate, context} = input
  if (node.kind !== 'text' || node.text === '') return null
  if (node.text.length === 1 && node.box.h < GLYPH_RUN_HEIGHT) return null
  if (candidate.media && holds({outer: candidate.box, inner: node.box})) return 1 - bestText({node, context})
  if (candidate.text === '') return 0
  return similarity({a: node.text, b: candidate.text})
}

function bestText(input: {node: View; context: Context}): number {
  const {node, context} = input
  const known = context.bestText.get(node.key)
  if (known !== undefined) return known
  const best = Math.max(
    0,
    ...context.candidates
      .filter((candidate) => candidate.text !== '')
      .map((candidate) => similarity({a: node.text, b: candidate.text})),
  )
  context.bestText.set(node.key, best)
  return best
}

function similarity(input: {a: string; b: string}): number {
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
  const apart = Math.hypot(...node.fill.map((channel, index) => channel - (candidate.fill?.[index] ?? channel)))
  return Math.max(0, 1 - apart / (TOLERANCES.segmentDistance * STYLE_SPREAD))
}

function geometryVote(input: {node: View; candidate: View; context: Context}): number | null {
  const {node, candidate, context} = input
  const box =
    node.kind === 'text' ? (nearestLine({lines: candidate.lines, box: node.box}) ?? candidate.box) : candidate.box
  const page = distance({a: centre(node.box), b: centre(box)}) / context.diagonal
  const anchor = node.parent === null ? undefined : context.assigned.get(node.parent.key)
  const nodeOrigin = anchor === undefined || node.parent === null ? {x: 0, y: 0} : node.parent.box
  const candidateOrigin = anchor === undefined ? {x: 0, y: 0} : anchor.box
  const a = centre(node.box)
  const b = centre(box)
  const local = distance({
    a: {x: a.x - nodeOrigin.x, y: a.y - nodeOrigin.y},
    b: {x: b.x - candidateOrigin.x, y: b.y - candidateOrigin.y},
  })
  return PAGE_SHARE * Math.max(0, 1 - page) + LOCAL_SHARE * Math.max(0, 1 - local / LOCAL_REACH)
}

function nearestLine(input: {lines: Box[]; box: Box}): Box | null {
  const target = centre(input.box)
  return input.lines.reduce<Box | null>((best, line) => {
    if (best === null) return line
    return distance({a: centre(line), b: target}) < distance({a: centre(best), b: target}) ? line : best
  }, null)
}

function centre(box: Box): {x: number; y: number} {
  return {x: box.x + box.w / 2, y: box.y + box.h / 2}
}

function distance(input: {a: {x: number; y: number}; b: {x: number; y: number}}): number {
  return Math.hypot(X_WEIGHT * (input.a.x - input.b.x), input.a.y - input.b.y)
}

function pixelVote(input: {node: View; candidate: View; context: Context}): number | null {
  const {node, candidate, context} = input
  const box =
    node.kind === 'text' ? (nearestLine({lines: candidate.lines, box: node.box}) ?? candidate.box) : candidate.box
  const a = hashed({raster: context.nodeRaster, box: node.box, context, side: 'node'})
  const b = hashed({raster: context.candidateRaster, box, context, side: 'candidate'})
  const differing = a.reduce((sum, bit, index) => sum + (bit === b[index] ? 0 : 1), 0)
  return 1 - differing / HASH_BITS
}

function hashed(input: {raster: Raster; box: Box; context: Context; side: string}): Uint8Array {
  const {raster, box, context} = input
  const key = `${input.side}:${box.x},${box.y},${box.w},${box.h}`
  const known = context.hashes.get(key)
  if (known !== undefined) return known
  const made = averageHash({raster, box})
  context.hashes.set(key, made)
  return made
}

function averageHash(input: {raster: Raster; box: Box}): Uint8Array {
  const {raster, box} = input
  const cells = Float64Array.from({length: HASH_BITS}, (_, cell) => cellLuminance({raster, box, cell}))
  const mean = cells.reduce((sum, value) => sum + value, 0) / HASH_BITS
  return Uint8Array.from(cells, (value) => (value > mean ? 1 : 0))
}

function cellLuminance(input: {raster: Raster; box: Box; cell: number}): number {
  const {raster, box, cell} = input
  const cx = cell % HASH_SIDE
  const cy = (cell - cx) / HASH_SIDE
  const x0 = Math.max(0, Math.floor(box.x + (cx * box.w) / HASH_SIDE))
  const y0 = Math.max(0, Math.floor(box.y + (cy * box.h) / HASH_SIDE))
  const x1 = Math.min(raster.width, Math.max(x0 + 1, Math.floor(box.x + ((cx + 1) * box.w) / HASH_SIDE)))
  const y1 = Math.min(raster.height, Math.max(y0 + 1, Math.floor(box.y + ((cy + 1) * box.h) / HASH_SIDE)))
  const stepX = Math.max(1, Math.floor((x1 - x0) / HASH_SAMPLES))
  const stepY = Math.max(1, Math.floor((y1 - y0) / HASH_SAMPLES))
  const columns = Math.ceil(Math.max(0, x1 - x0) / stepX)
  const count = columns * Math.ceil(Math.max(0, y1 - y0) / stepY)
  let total = 0
  for (let sample = 0; sample < count; sample += 1) {
    const x = x0 + (sample % columns) * stepX
    const y = y0 + Math.floor(sample / columns) * stepY
    total += luminanceAt({raster, index: (y * raster.width + x) * 4})
  }
  return count === 0 ? 0 : total / count
}

function luminanceAt(input: {raster: Raster; index: number}): number {
  const {data} = input.raster
  const {index} = input
  return (data[index] ?? 0) * 0.299 + (data[index + 1] ?? 0) * 0.587 + (data[index + 2] ?? 0) * 0.114
}

function hintsVote(input: {node: View; candidate: View}): number | null {
  const {node, candidate} = input
  if (candidate.tokens.length === 0) return null
  const wanted = new Set([node.klass, ...node.text.split(' ')])
  const matched = candidate.tokens.filter((token) => wanted.has(token)).length
  return matched === 0 ? null : matched / candidate.tokens.length
}

function twinsVote(input: {node: View; candidate: View; context: Context}): number | null {
  const vote = input.context.twinVotes.get(input.node.key)
  if (vote === undefined || vote.path !== input.candidate.key) return null
  return vote.confidence
}

type Owner = {selector: string; live: LiveComponent}

function grow(input: {
  components: LiveComponent[]
  parent: Pair | null
  host: Owner | null
  depth: number
  byPath: Map<string, Matched[]>
  live: Raster
  source: MeasureSource
  mismatchAt: (box: Box) => number
}): Pair[] {
  const {components, parent, host, depth, byPath} = input
  const keys = components.map(sourceKey)
  const level = components.map((component, position) => {
    const key = keys[position] ?? null
    const shared = key !== null && keys.indexOf(key) !== keys.lastIndexOf(key)
    const owner: Owner = {selector: componentSelector({component, parent: host, shared}), live: component}
    const entries = byPath.get(component.path) ?? []
    const pair = entries.length === 0 ? null : makePair({...input, component, entries, selector: owner.selector})
    return {pair, component, owner}
  })
  const siblings = level.flatMap((entry) => entry.pair ?? [])
  siblings.forEach((pair, index) => {
    pair.prev = siblings[index - 1] ?? null
    pair.next = siblings[index + 1] ?? null
  })
  return level.flatMap(({pair, component, owner}) => {
    const below = grow({
      ...input,
      components: component.children,
      parent: pair ?? parent,
      host: owner,
      depth: pair === null ? depth : depth + 1,
    })
    return pair === null ? below : [pair, ...below]
  })
}

function makePair(input: {
  component: LiveComponent
  entries: Matched[]
  selector: string
  parent: Pair | null
  host: Owner | null
  depth: number
  live: Raster
  source: MeasureSource
  mismatchAt: (box: Box) => number
}): Pair {
  const {component, entries, selector, parent, host, depth, live, source, mismatchAt} = input
  const texts = entries.flatMap((entry) => (entry.node.kind === 'text' ? [entry.node] : []))
  const boxed = entries.find((entry) => entry.node.kind !== 'text')
  const node = (boxed ?? entries[0])?.node ?? {id: component.path, kind: 'image', box: component.box}
  const pair: Pair = {
    live: component,
    node,
    texts,
    source,
    confidence: Math.max(...entries.map((entry) => entry.confidence)),
    selector,
    liveBox: component.box,
    targetBox: component.box,
    mismatch: mismatchAt(component.box),
    depth,
    parent,
    host,
    prev: null,
    next: null,
  }
  if (boxed !== undefined) return {...pair, targetBox: boxed.node.box}
  const shifts = texts.map((text) => inkShift({pair, node: text, live}))
  const dx = median0(shifts.map((shift) => shift.dx))
  const dy = median0(shifts.map((shift) => shift.dy))
  return {...pair, targetBox: {...component.box, x: component.box.x + dx, y: component.box.y + dy}}
}

function sourceKey(component: LiveComponent): string | null {
  const {source} = component
  return source === null ? null : `${source.file}:${source.line}:${source.column}`
}

function componentSelector(input: {component: LiveComponent; parent: Owner | null; shared: boolean}): string {
  const {component, parent, shared} = input
  const key = sourceKey(component)
  if (key === null) return parent === null ? component.tag : `${parent.selector} > ${component.tag}`
  const selector = `[${SOURCE_ATTR}="${key}"]`
  return shared ? `${selector}:nth-child(${component.index})` : selector
}

function median0(values: number[]): number {
  return values.length === 0 ? 0 : median(values)
}

function displacement(pair: Pair): Shift {
  return {dx: pair.targetBox.x - pair.liveBox.x, dy: pair.targetBox.y - pair.liveBox.y}
}

function relative(input: {a: Shift; b: Shift}): Shift {
  return {dx: input.a.dx - input.b.dx, dy: input.a.dy - input.b.dy}
}

function beyond(input: {shift: Shift; tolerances: Tolerances}): boolean {
  const {shift, tolerances} = input
  return Math.abs(shift.dx) > tolerances.geometryPx || Math.abs(shift.dy) > tolerances.geometryPx
}

function sharedShift(input: {
  pair: Pair
  pairs: Pair[]
  own: (pair: Pair) => Shift
  tolerances: Tolerances
}): Shift | null {
  const {pair, pairs, own, tolerances} = input
  const children = pairs.filter((child) => child.parent === pair)
  if (children.length < 2) return null
  const shifts = children.map(own)
  const shift = {dx: median0(shifts.map((entry) => entry.dx)), dy: median0(shifts.map((entry) => entry.dy))}
  const agree = shifts.every((entry) => !beyond({shift: relative({a: entry, b: shift}), tolerances}))
  return agree && beyond({shift, tolerances}) ? shift : null
}
