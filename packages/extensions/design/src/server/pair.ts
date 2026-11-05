import {groupBy, median, omit, words} from 'es-toolkit'
import {parse} from 'culori'
import {SOURCE_ATTR, TOLERANCES, type Tolerances} from '../shared/tolerances.js'
import type {Box, Fingerprint, Item, LiveComponent, Raster} from '../shared/types.js'
import type {Decision, DesignNode, Match, Pairer, Ranker} from '../shared/defs.js'
import {walk} from '../shared/tree.js'
import {expand, fnv, sameLine, trimToInk, union, type Rgb} from './raster.js'

export const PAIRERS = {vote: votePairer} as const satisfies Record<string, Pairer>

export const RANKERS = {impact: impactRanker} as const satisfies Record<string, Ranker>

export function fingerprint(
  component: Pick<LiveComponent, 'source' | 'key' | 'instance' | 'owner' | 'tag' | 'glyphs' | 'box'>,
): Fingerprint {
  return {
    source: component.source,
    key: component.key,
    instance: component.instance,
    owner: component.owner,
    tag: component.tag,
    textHash: fnv(folded(component.glyphs.map((glyph) => glyph.text).join(' '))),
    box: component.box,
  }
}

export function glyphRun(node: Match['node']): boolean {
  return node.kind === 'text' && glyphSized({text: folded(node.text), box: node.box})
}

export type Shift = {dx: number; dy: number}

export type Offset = {match: Match | null; shift: Shift}

export function align(input: {root: Match; live: Raster; exact: boolean; tolerances: Tolerances}): {
  global: Shift
  offsets: Offset[]
} {
  const {root, live, exact, tolerances} = input
  const paired = [...walk({root})].flatMap(({node, depth}): Seated[] =>
    depth === 0 || node.live === null ? [] : [{match: node, live: node.live}],
  )
  const global = exact ? boxShift(paired) : medianShift(paired.flatMap((seated) => textShift({seated, raster: live})))
  const moved = (seated: Seated): Shift => relative({a: displacement({seated, raster: live, exact}), b: global})
  const page: Offset[] = beyond({shift: global, tolerances}) ? [{match: null, shift: global}] : []
  return {global, offsets: [...page, ...offsetsUnder({match: root, anchor: null, moved, tolerances})]}
}

export function targetBox(input: {node: Match['node']; live: PairedLive; raster: Raster; exact: boolean}): Box {
  const {node, live, raster, exact} = input
  if (node.kind !== 'text' || exact) return node.box
  const shift = inkShift({node, live, raster})
  return {...live.box, x: live.box.x + shift.dx, y: live.box.y + shift.dy}
}

export function selectors(live: LiveComponent): Map<string, string> {
  return new Map([
    [live.path, componentSelector({component: live, parent: null, shared: false})],
    ...selectorsUnder({components: live.children, host: null}),
  ])
}

type PairedLive = NonNullable<Match['live']>

type Seated = {match: Match; live: PairedLive}

type TextNode = Extract<Match['node'], {kind: 'text'}>

type BoxNode = Extract<Match['node'], {kind: 'box'}>

const PAGE_SHIFT_PAIRS = 3

function boxShift(paired: Seated[]): Shift {
  const boxed = paired.filter(({match}) => match.node.kind !== 'text')
  if (boxed.length < PAGE_SHIFT_PAIRS) return {dx: 0, dy: 0}
  return medianShift(
    boxed.map(({match, live}) => ({dx: match.node.box.x - live.box.x, dy: match.node.box.y - live.box.y})),
  )
}

function medianShift(shifts: Shift[]): Shift {
  return {dx: median0(shifts.map((shift) => shift.dx)), dy: median0(shifts.map((shift) => shift.dy))}
}

function textShift(input: {seated: Seated; raster: Raster}): Shift[] {
  const {node} = input.seated.match
  if (node.kind !== 'text') return []
  return [inkShift({node, live: input.seated.live, raster: input.raster})]
}

function inkShift(input: {node: TextNode; live: PairedLive; raster: Raster}): Shift {
  const {node, live, raster} = input
  const line = nearestLine({lines: live.glyphs.flatMap((glyph) => glyph.boxes), box: node.box})
  if (line === null) return {dx: 0, dy: 0}
  const ink = trimToInk({raster, box: line})
  return {dx: node.box.x - ink.x, dy: node.box.y - ink.y}
}

function displacement(input: {seated: Seated; raster: Raster; exact: boolean}): Shift {
  const {seated, raster, exact} = input
  const {node} = seated.match
  const ink = exact && node.kind === 'text' ? inkToInk({node, live: seated.live}) : null
  const target = targetBox({node, live: seated.live, raster, exact})
  return ink ?? {dx: target.x - seated.live.box.x, dy: target.y - seated.live.box.y}
}

function inkToInk(input: {node: TextNode; live: PairedLive}): Shift | null {
  const {node, live} = input
  const glyphs = live.glyphs.flatMap((glyph) => glyph.boxes)
  const lines = node.lines.map((line) => line.box)
  if (glyphs.length === 0 || lines.length === 0) return null
  const drawn = union(glyphs)
  const design = union(lines)
  return {
    dx: horizontal({design, live: drawn, alignment: live.styles.textAlign}),
    dy: centre(design).y - centre(drawn).y,
  }
}

function horizontal(input: {design: Box; live: Box; alignment: string}): number {
  const {design, live, alignment} = input
  if (alignment === 'center') return centre(design).x - centre(live).x
  if (alignment === 'right' || alignment === 'end') return design.x + design.w - (live.x + live.w)
  return design.x - live.x
}

function relative(input: {a: Shift; b: Shift}): Shift {
  return {dx: input.a.dx - input.b.dx, dy: input.a.dy - input.b.dy}
}

function beyond(input: {shift: Shift; tolerances: Tolerances}): boolean {
  const {shift, tolerances} = input
  return Math.abs(shift.dx) > tolerances.geometryPx || Math.abs(shift.dy) > tolerances.geometryPx
}

function offsetsUnder(input: {
  match: Match
  anchor: Seated | null
  moved: (seated: Seated) => Shift
  tolerances: Tolerances
}): Offset[] {
  const {anchor, moved, tolerances} = input
  return input.match.children.flatMap((child) => {
    const seated = child.live === null ? null : {match: child, live: child.live}
    const below = offsetsUnder({...input, match: child, anchor: seated ?? anchor})
    if (seated === null) return below
    if (anchor !== null && beyond({shift: moved(anchor), tolerances})) return below
    const shift = moved(seated)
    return beyond({shift, tolerances}) ? [{match: child, shift}, ...below] : below
  })
}

function selectorsUnder(input: {components: LiveComponent[]; host: string | null}): [string, string][] {
  const keys = input.components.map(sourceKey)
  return input.components.flatMap((component, position): [string, string][] => {
    const key = keys[position] ?? null
    const shared = key !== null && keys.indexOf(key) !== keys.lastIndexOf(key)
    const selector = componentSelector({component, parent: input.host, shared})
    return [[component.path, selector], ...selectorsUnder({components: component.children, host: selector})]
  })
}

function componentSelector(input: {component: LiveComponent; parent: string | null; shared: boolean}): string {
  const {component, parent, shared} = input
  const key = sourceKey(component)
  if (key === null) return parent === null ? component.tag : `${parent} > ${component.tag}`
  const selector = `[${SOURCE_ATTR}="${key}"]`
  return shared ? `${selector}:nth-child(${component.index})` : selector
}

function sourceKey(component: LiveComponent): string | null {
  const {source} = component
  return source === null ? null : `${source.file}:${source.line}:${source.column}`
}

type KindClass = 'heading' | 'text' | 'control' | 'container' | 'media'

type View = {
  key: string
  kind: 'text' | 'box' | 'image' | 'element'
  box: Box
  lines: Box[]
  text: string
  words: string
  alone: boolean
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
  twins: Map<string, string>
  candidates: View[]
  bestText: Map<string, number>
  spoken: Record<string, View[]>
}

type VoterName = 'text' | 'kind' | 'structure' | 'style' | 'geometry' | 'hints' | 'twins'

type Voter = {
  name: VoterName
  base: number
  score: (input: {node: View; candidate: View; context: Context}) => number | null
}

type State = {boxes: Set<string>; texts: Map<string, Box[]>; trusted: Set<VoterName>}

type VoteInput = {
  nodes: View[]
  candidates: View[]
  context: Context
  holders: Map<string, string>
  pins: {node: string; path: string}[]
  tolerances: Tolerances
  deadline: number
}

type Assignment = {node: View; candidate: View; score: number}

type Weights = Map<VoterName, number>

type Pairing = Omit<VoteInput, 'nodes'> & {
  weights: Weights
  floors: Map<string, number>
  state: State
  views: Map<string, View>
  components: Map<string, LiveComponent>
}

type Held = {node: BoxNode; parent: DesignNode | null; held: DesignNode[]}

const CONTROL_HEIGHT = 48
const CONTROL_WIDTH = 320
const HEADING_INK = 0.72 * 20
const INK_SHARE = 0.72
const INK_SPREAD = 0.3
const SHORT_TEXT = 6
const CONTROL_WORDS = 4
const GLYPH_RUN_HEIGHT = 14
const MEDIA_TEXT = 0.4
const UNDER = 0.6
const ORDER = 0.4
const PAGE_SHARE = 0.4
const LOCAL_SHARE = 0.6
const LOCAL_REACH = 40
const X_WEIGHT = 0.5
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
  {name: 'hints', base: 0.1, score: hintsVote},
  {name: 'twins', base: 0.1, score: twinsVote},
]

function votePairer(input: Parameters<Pairer>[0]): ReturnType<Pairer> {
  const {design, live, decisions} = input
  const held = heldNodes(design.root)
  const views = nodeViews({root: design.root, held})
  const nodes = [...views.values()]
  const candidates = elementViews(live.children)
  const context: Context = {
    assigned: new Map(),
    diagonal: Math.hypot(design.root.box.w, design.root.box.h) || 1,
    twins: twinPaths(decisions),
    candidates,
    bestText: new Map(),
    spoken: groupBy(
      nodes.filter((node) => node.kind === 'text' && node.words !== ''),
      (node) => node.words,
    ),
  }
  const shared = {
    candidates,
    context,
    holders: textHolders(held),
    pins: pinsFrom(decisions),
    tolerances: TOLERANCES,
    deadline: Date.now() + TOLERANCES.pairBudgetMs,
  }
  const weights = calibrate({...shared, nodes})
  const trusted = new Set(
    VOTERS.filter((voter) => (weights.get(voter.name) ?? 0) >= voter.base / 2).map((voter) => voter.name),
  )
  const pairing: Pairing = {
    ...shared,
    weights,
    floors: floors({...shared, nodes, weights}),
    state: {boxes: new Set(), texts: new Map(), trusted},
    views,
    components: new Map(flatten(live.children).map((component) => [component.path, component])),
  }
  return Promise.resolve(pairNode({node: design.root, live, view: null, confidence: 1, pool: candidates, pairing}))
}

function pairNode(input: {
  node: DesignNode
  live: LiveComponent | null
  view: View | null
  confidence: number
  pool: View[]
  pairing: Pairing
}): Match {
  const {node, live, view, pairing} = input
  const pool =
    view === null ? input.pool : pairing.candidates.filter((candidate) => inside({view: candidate, anchor: view}))
  const level = voteLevel({
    ...pairing,
    nodes: node.children.flatMap((child) => pairing.views.get(child.id) ?? []),
    candidates: pool,
  })
  const {children: _children, ...own} = node
  return {
    node: own,
    live: live === null ? null : omit(live, ['children']),
    confidence: live === null ? 0 : input.confidence,
    source: 'dom',
    deltas: [],
    status: live === null ? 'unbuilt' : 'paired',
    since: '',
    children: node.children.map((child) => {
      const taken = level.get(child.id)
      return pairNode({
        node: child,
        live: taken === undefined ? null : (pairing.components.get(taken.candidate.key) ?? null),
        view: taken?.candidate ?? null,
        confidence: taken?.score ?? 0,
        pool,
        pairing,
      })
    }),
  }
}

function twinPaths(decisions: Decision[]): Map<string, string> {
  return new Map(
    decisions.flatMap((decision): [string, string][] =>
      decision.kind === 'twin' && typeof decision.value === 'string' ? [[decision.anchor, decision.value]] : [],
    ),
  )
}

function pinsFrom(decisions: Decision[]): {node: string; path: string}[] {
  return decisions.flatMap((decision) =>
    decision.kind === 'pin' && typeof decision.value === 'string'
      ? [{node: decision.anchor, path: decision.value}]
      : [],
  )
}

function impactRanker(input: {items: Item[]}): Item[] {
  return input.items.toSorted(
    (a, b) => b.confidence * b.size - a.confidence * a.size || a.box.y - b.box.y || a.depth - b.depth,
  )
}

function heldNodes(root: DesignNode): Held[] {
  return [...walk({root})].flatMap(({node, parent, depth}): Held[] => {
    if (node.kind !== 'box' || parent === null) return []
    const drawn = parent.children.filter(
      (sibling) => sibling.kind === 'text' && holds({outer: node.box, inner: sibling.box}),
    )
    return [{node, parent: depth > 1 ? parent : null, held: [...node.children, ...drawn]}]
  })
}

function nodeViews(input: {root: DesignNode; held: Held[]}): Map<string, View> {
  const visits = [...walk({root: input.root})].filter((visit) => visit.depth > 0)
  const said = groupBy(
    visits.flatMap(({node}) => (node.kind === 'text' ? [spaced(node.text)] : [])),
    (text) => text,
  )
  const ranks = siblingRanks(input.root)
  const controls = controlBoxes(input.held)
  const views = new Map<string, View>()
  visits.forEach(({node, parent, depth}) => {
    const within = depth > 1 ? parent : null
    views.set(node.id, {
      key: node.id,
      kind: node.kind,
      box: node.box,
      lines: [node.box],
      text: node.kind === 'text' ? folded(node.text) : '',
      words: node.kind === 'text' ? spaced(node.text) : '',
      alone: node.kind === 'text' && (said[spaced(node.text)] ?? []).length === 1,
      klass: nodeClass({node, within, controls}),
      ink: node.kind === 'text' ? inkHeight(node) : null,
      fill: node.kind === 'box' && node.paint !== undefined ? toRgb(node.paint.background) : null,
      tokens: [],
      parent: within === null ? null : (views.get(within.id) ?? null),
      rank: ranks.get(node.id) ?? 0,
      media: node.kind === 'image',
    })
  })
  return views
}

function siblingRanks(root: DesignNode): Map<string, number> {
  return new Map(
    [...walk({root})].flatMap(({node}) => {
      const ordered = node.children.toSorted((a, b) => readingOrder(a.box, b.box))
      return ordered.map((child, index): [string, number] => [child.id, spread({index, count: ordered.length})])
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

function controlBoxes(held: Held[]): Set<string> {
  return new Set(held.flatMap((entry) => (controlBox(entry) ? [entry.node.id] : [])))
}

function controlBox(input: Held): boolean {
  const {node, parent, held} = input
  if (controlSized(node.box)) return true
  const [only, ...rest] = held
  if (only === undefined || only.kind !== 'text' || rest.length > 0) return false
  const short = shortLine(only)
  if (node.box.h <= CONTROL_HEIGHT) return short
  return (short || atTopLeft({box: node.box, text: only.box})) && standsOut({node, parent})
}

function controlSized(box: Box): boolean {
  return box.h <= CONTROL_HEIGHT && box.w <= CONTROL_WIDTH
}

function shortLine(node: TextNode): boolean {
  return node.lines.length <= 1 && words(node.text).length <= CONTROL_WORDS
}

function atTopLeft(input: {box: Box; text: Box}): boolean {
  const {box, text} = input
  return text.x - box.x <= CONTROL_HEIGHT && text.y - box.y <= CONTROL_HEIGHT
}

function standsOut(input: {node: BoxNode; parent: DesignNode | null}): boolean {
  const {node, parent} = input
  if (node.border !== null && node.border.width > 0) return true
  const fill = node.paint === undefined ? null : toRgb(node.paint.background)
  if (fill === null) return false
  const behind = parent?.kind === 'box' && parent.paint !== undefined ? toRgb(parent.paint.background) : null
  if (behind === null) return true
  const apart = Math.hypot(...fill.map((channel, index) => channel - (behind[index] ?? channel)))
  return apart > TOLERANCES.segmentDistance
}

function nodeClass(input: {node: DesignNode; within: DesignNode | null; controls: Set<string>}): KindClass {
  const {node, within, controls} = input
  if (node.kind === 'image') return 'media'
  if (node.kind === 'box') return controls.has(node.id) ? 'control' : 'container'
  if (within !== null && controls.has(within.id)) return 'control'
  return inkHeight(node) >= HEADING_INK ? 'heading' : 'text'
}

function inkHeight(node: TextNode): number {
  return median0(node.lines.map((line) => line.box.h)) || node.box.h
}

function textHolders(held: Held[]): Map<string, string> {
  return new Map(
    held.flatMap(({node, held: inner}): [string, string][] => {
      const [only, ...rest] = inner
      return only === undefined || only.kind !== 'text' || rest.length > 0 ? [] : [[node.id, only.id]]
    }),
  )
}

function folded(text: string): string {
  return text.toLowerCase().split(' ').filter(Boolean).join(' ').trim()
}

function spaced(text: string): string {
  return text.split(' ').filter(Boolean).join(' ')
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
      words: spaced(component.glyphs.map((glyph) => glyph.text).join(' ')),
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

function sameBox(input: {a: Box; b: Box}): boolean {
  const {a, b} = input
  const edges = [a.x - b.x, a.y - b.y, a.x + a.w - b.x - b.w, a.y + a.h - b.y - b.h]
  return edges.every((edge) => Math.abs(edge) <= TOLERANCES.geometryPx)
}

function elementClass(input: {component: LiveComponent; lines: Box[]}): KindClass {
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

function calibrate(input: VoteInput): Weights {
  const base: Weights = new Map(VOTERS.map((voter) => [voter.name, voter.base]))
  const tallies = input.nodes.flatMap((node) => {
    const pool = candidatePool({input, node}).map((candidate) => weighed({input, weights: base, node, candidate}))
    const consensus = pool.reduce<Scored | null>(
      (best, entry) => (best === null || entry.score > best.score ? entry : best),
      null,
    )
    if (consensus === null || consensus.score < input.tolerances.pairFloor) return []
    return VOTERS.flatMap((voter) => {
      const own = pool.filter((entry) => entry.votes[voter.name] !== null)
      if (own.length === 0 || consensus.votes[voter.name] === null) return []
      const top = Math.max(...own.map((entry) => entry.votes[voter.name] ?? 0))
      const agrees = (consensus.votes[voter.name] ?? 0) >= top - TIE
      return [{name: voter.name, agrees}]
    })
  })
  const byVoter = Map.groupBy(tallies, (tally) => tally.name)
  return new Map(
    VOTERS.map((voter) => {
      const tally = byVoter.get(voter.name)
      if (tally === undefined) return [voter.name, voter.base]
      const agreement = tally.filter((entry) => entry.agrees).length / tally.length
      return [voter.name, voter.base * Math.max(input.tolerances.pairMinWeight, agreement)]
    }),
  )
}

function candidatePool(input: {input: VoteInput; node: View}): View[] {
  return input.input.candidates.filter((candidate) => elementCompatible({node: input.node, candidate}))
}

function elementCompatible(input: {node: View; candidate: View}): boolean {
  const {node, candidate} = input
  const own = candidate.lines.length > 0 && candidate.text !== ''
  if (node.kind === 'text') return own
  if (node.kind === 'image') return !own
  return true
}

function weighed(input: {input: VoteInput; weights: Weights; node: View; candidate: View}): Scored {
  const {node, candidate, weights} = input
  const {context} = input.input
  const votes = Object.fromEntries(VOTERS.map((voter) => [voter.name, voter.score({node, candidate, context})]))
  const applied = VOTERS.filter((voter) => votes[voter.name] !== null && votes[voter.name] !== undefined)
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
    hints: votes['hints'] ?? null,
    twins: votes['twins'] ?? null,
  }
}

function inside(input: {view: View; anchor: View}): boolean {
  if (input.view === input.anchor) return true
  const parent = input.view.parent
  return parent !== null && inside({view: parent, anchor: input.anchor})
}

function floors(input: VoteInput & {weights: Weights}): Map<string, number> {
  const {weights} = input
  return new Map(
    input.nodes.map((node) => [
      node.key,
      median0(candidatePool({input, node}).map((candidate) => weighed({input, weights, node, candidate}).score)),
    ]),
  )
}

function voteLevel(
  input: VoteInput & {weights: Weights; floors: Map<string, number>; state: State},
): Map<string, Assignment> {
  const {weights, state, nodes, context, floors: pools} = input
  if (nodes.length === 0) return new Map()
  const pinned = pinsFirst({input, state})
  const fitted = exactFits({input, weights, state})
  const views = new Map(nodes.map((node) => [node.key, node]))
  const open = (held: boolean): Map<string, Scored[]> =>
    new Map(
      nodes
        .filter((node) => !context.assigned.has(node.key) && input.holders.has(node.key) === held)
        .map((node) => [node.key, scoredList({input, weights, state, node})]),
    )
  const first = greedy({input, weights, state, pools, lists: open(false), views, matched: [...pinned, ...fitted]})
  const followed = followTexts({input, weights, state})
  const matched = greedy({input, weights, state, pools, lists: open(true), views, matched: [...first, ...followed]})
  return new Map(matched.map((entry) => [entry.node.key, entry]))
}

function pinsFirst(input: {input: VoteInput; state: State}): Assignment[] {
  const {state} = input
  const {nodes, context} = input.input
  return input.input.pins.flatMap((pin) => {
    const node = nodes.find((view) => view.key === pin.node)
    const candidate = context.candidates.find((view) => view.key === pin.path)
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

function exactFits(input: {input: VoteInput; weights: Weights; state: State}): Assignment[] {
  const {weights, state} = input
  const {nodes, context} = input.input
  const fits = nodes
    .filter((node) => node.kind === 'box' && !context.assigned.has(node.key))
    .flatMap((node) =>
      candidatePool({input: input.input, node})
        .filter((candidate) => sameBox({a: node.box, b: candidate.box}))
        .map((candidate) => ({node, candidate, apart: edgeDistance({a: node.box, b: candidate.box})})),
    )
    .toSorted((a, b) => a.apart - b.apart)
  return fits.flatMap(({node, candidate}): Assignment[] => {
    if (context.assigned.has(node.key) || state.boxes.has(candidate.key)) return []
    const {score} = weighed({input: input.input, weights, node, candidate})
    take({node, candidate, state, context})
    return [{node, candidate, score}]
  })
}

function edgeDistance(input: {a: Box; b: Box}): number {
  const {a, b} = input
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.x + a.w - b.x - b.w) + Math.abs(a.y + a.h - b.y - b.h)
}

function scoredList(input: {input: VoteInput; weights: Weights; state: State; node: View}): Scored[] {
  const {node, state, weights} = input
  const {tolerances} = input.input
  return candidatePool({input: input.input, node})
    .filter((candidate) => elementGate({node, candidate, state, tolerances}))
    .map((candidate) => weighed({input: input.input, weights, node, candidate}))
    .toSorted((a, b) => b.score - a.score)
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
  const within = holds({outer: reach, inner: {...centre(node.box), w: 0, h: 0}})
  return (
    within ||
    (node.alone && node.words === candidate.words) ||
    (!state.trusted.has('geometry') && !state.texts.has(candidate.key))
  )
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

function greedy(input: {
  input: VoteInput
  weights: Weights
  state: State
  pools: Map<string, number>
  lists: Map<string, Scored[]>
  views: Map<string, View>
  matched: Assignment[]
}): Assignment[] {
  const {state, pools, lists, views} = input
  const {context, tolerances, deadline} = input.input
  if (Date.now() > deadline) return input.matched
  const ready = [...lists.entries()].flatMap(([key, scored]) => {
    const node = views.get(key)
    if (node === undefined) return []
    const list = scored.filter((entry) => !spokenElsewhere({node, candidate: entry.candidate, context}))
    const top = list[0]
    if (top === undefined || !passes({node, list, floor: pools.get(key) ?? 0, state, tolerances})) return []
    return [{node, top}]
  })
  const best = ready.reduce<(typeof ready)[number] | null>(
    (found, entry) => (found === null || entry.top.score > found.top.score ? entry : found),
    null,
  )
  if (best === null) return input.matched
  const {node, top} = best
  take({node, candidate: top.candidate, state, context})
  lists.delete(node.key)
  lists.forEach((list, key) => {
    const other = views.get(key)
    if (other === undefined || !list.some((entry) => entry.candidate === top.candidate)) return
    lists.set(
      key,
      list.filter(
        (entry) =>
          entry.candidate !== top.candidate ||
          elementGate({node: other, candidate: entry.candidate, state, tolerances}),
      ),
    )
  })
  return greedy({...input, matched: [...input.matched, {node, candidate: top.candidate, score: top.score}]})
}

function spokenElsewhere(input: {node: View; candidate: View; context: Context}): boolean {
  const {node, candidate, context} = input
  if (node.kind !== 'text' || candidate.words === '' || saysSame({node, candidate})) return false
  return (context.spoken[candidate.words] ?? []).some((other) => other !== node && !context.assigned.has(other.key))
}

function saysSame(input: {node: View; candidate: View}): boolean {
  return input.node.words === input.candidate.words
}

function passes(input: {node: View; list: Scored[]; floor: number; state: State; tolerances: Tolerances}): boolean {
  const {node, list, floor, state, tolerances} = input
  const [top, runner] = list
  if (top === undefined) return false
  if (node.kind === 'text' && top.votes.text === null && top.votes.structure === null) return false
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

function followTexts(input: {input: VoteInput; weights: Weights; state: State}): Assignment[] {
  const {weights, state} = input
  const {nodes, holders, context} = input.input
  return nodes.flatMap((node): Assignment[] => {
    const text = holders.get(node.key)
    if (text === undefined || context.assigned.has(node.key)) return []
    const element = context.assigned.get(text)
    if (element === undefined) return []
    const candidate = element.klass === 'control' || element.klass === 'media' ? element : enclosing(element)
    if (candidate === null || state.boxes.has(candidate.key)) return []
    const {score} = weighed({input: input.input, weights, node, candidate})
    take({node, candidate, state, context})
    return [{node, candidate, score}]
  })
}

function enclosing(view: View): View | null {
  const climb = (from: View | null): View | null => {
    if (from === null || from.parent === null) return null
    return holds({outer: from.box, inner: view.box}) ? from : climb(from.parent)
  }
  return climb(view.parent)
}

function textVote(input: {node: View; candidate: View; context: Context}): number | null {
  const {node, candidate, context} = input
  if (node.kind !== 'text' || node.text === '') return null
  if (glyphSized(node)) return null
  if (candidate.media && holds({outer: candidate.box, inner: node.box})) return 1 - bestText({node, context})
  if (candidate.text === '') return 0
  return similarity({a: node.text, b: candidate.text})
}

function glyphSized(input: {text: string; box: Box}): boolean {
  return input.text.length === 1 && input.box.h < GLYPH_RUN_HEIGHT
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

function hintsVote(input: {node: View; candidate: View}): number | null {
  const {node, candidate} = input
  if (candidate.tokens.length === 0) return null
  const wanted = new Set([node.klass, ...node.text.split(' ')])
  const matched = candidate.tokens.filter((token) => wanted.has(token)).length
  return matched === 0 ? null : matched / candidate.tokens.length
}

function twinsVote(input: {node: View; candidate: View; context: Context}): number | null {
  return input.context.twins.get(input.node.key) === input.candidate.key ? 1 : null
}

function flatten(components: LiveComponent[]): LiveComponent[] {
  return components.flatMap((component) => [component, ...flatten(component.children)])
}

function median0(values: number[]): number {
  return values.length === 0 ? 0 : median(values)
}
