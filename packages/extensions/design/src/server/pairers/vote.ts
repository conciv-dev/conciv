import {groupBy, intersection, median, minBy, omit, partition, words} from 'es-toolkit'
import {parse} from 'culori'
import {TOLERANCES, type Tolerances} from '../../shared/tolerances.js'
import type {Box, Fingerprint, LiveComponent} from '../../shared/types.js'
import type {
  Decision,
  DesignNode,
  Geometry,
  Match,
  Pairer,
  Similarity,
  Voter,
  VoteContext,
  VoterName,
  VoteView,
} from '../../shared/defs.js'
import {walk} from '../../shared/tree.js'
import {type Rgb} from '../raster.js'
import {centre, expand, holds, readingOrder} from '../../shared/box.js'
import {INK_SHARE, folded} from '../../shared/tolerances.js'

export function createVotePairer(input: {similarity: Similarity; geometry: Geometry}): Pairer {
  return (request) => votePairer({...request, ...input})
}

type Votes = Record<VoterName, number | null>

type Scored = {candidate: VoteView; score: number; votes: Votes}

type TextNode = Extract<DesignNode, {kind: 'text'}>

type BoxNode = Extract<DesignNode, {kind: 'box'}>

type State = {boxes: Set<string>; texts: Map<string, Box[]>; trusted: Set<VoterName>}

type VoteInput = {
  voters: Voter[]
  nodes: VoteView[]
  candidates: VoteView[]
  context: VoteContext
  holders: Map<string, string>
  pins: {node: string; path: string}[]
  tolerances: Tolerances
  deadline: number
}

type Assignment = {node: VoteView; candidate: VoteView; score: number}

type Weights = Map<VoterName, number>

type Pairing = Omit<VoteInput, 'nodes'> & {
  weights: Weights
  floors: Map<string, number>
  state: State
  views: Map<string, VoteView>
  components: Map<string, LiveComponent>
  records: Map<string, Carried>
  prints: Map<string, Fingerprint>
}

type Carried = {path: string; fingerprint: Fingerprint; confidence: number}

type Level = {assignments: Map<string, Assignment>; partial: boolean; carried: number}

type Paired = {match: Match; partial: boolean; carried: number}

type Held = {node: BoxNode; parent: DesignNode | null; held: DesignNode[]}

const CONTROL_HEIGHT = 48

const CONTROL_WIDTH = 320

const HEADING_INK = 0.72 * 20

const CONTROL_WORDS = 4

const TIE = 1e-9

const OPAQUE_HEX_LENGTH = 7

const MEDIA_TAGS = new Set(['img', 'svg', 'picture', 'video', 'canvas'])

const CONTROL_TAGS = new Set(['button', 'input', 'select', 'textarea'])

const CONTROL_ROLES = new Set(['button', 'link', 'textbox', 'checkbox', 'radio', 'tab', 'menuitem', 'switch'])

function votePairer(input: Parameters<Pairer>[0] & {similarity: Similarity; geometry: Geometry}): ReturnType<Pairer> {
  const {design, live, decisions, previous, rasters, twins, budget, similarity, geometry} = input
  const {fingerprint} = geometry
  const held = heldNodes(design.root)
  const views = nodeViews({root: design.root, held})
  const nodes = [...views.values()]
  const candidates = elementViews(live.children)
  const components = new Map(flatten(live.children).map((component) => [component.path, component]))
  const context: VoteContext = {
    assigned: new Map(),
    diagonal: Math.hypot(design.root.box.w, design.root.box.h) || 1,
    nodeRaster: rasters.target,
    candidateRaster: rasters.live,
    hashes: new Map(),
    twins: new Map(twins.map((twin) => [twin.node, twin.path])),
    candidates,
    bestText: new Map(),
    spoken: groupBy(
      nodes.filter((node) => node.kind === 'text' && node.words !== ''),
      (node) => node.words,
    ),
  }
  const shared = {
    voters: similarity.voters,
    candidates,
    context,
    holders: textHolders(held),
    pins: pinsFrom(decisions),
    tolerances: TOLERANCES,
    deadline: Date.now() + budget,
  }
  const weights = calibrate({...shared, nodes})
  const trusted = new Set(
    similarity.voters.filter((voter) => (weights.get(voter.name) ?? 0) >= voter.base / 2).map((voter) => voter.name),
  )
  const pairing: Pairing = {
    ...shared,
    weights,
    floors: floors({...shared, nodes, weights}),
    state: {boxes: new Set(), texts: new Map(), trusted},
    views,
    components,
    records: carriedRecords({previous, fingerprint}),
    prints: new Map(
      candidates.flatMap((candidate): [string, Fingerprint][] => {
        const component = components.get(candidate.key)
        return component === undefined ? [] : [[candidate.key, fingerprint(component)]]
      }),
    ),
  }
  const {match, partial, carried} = pairNode({
    node: design.root,
    live,
    view: null,
    confidence: 1,
    pool: candidates,
    pairing,
  })
  return Promise.resolve({root: match, partial, carried})
}

function pairNode(input: {
  node: DesignNode
  live: LiveComponent | null
  view: VoteView | null
  confidence: number
  pool: VoteView[]
  pairing: Pairing
}): Paired {
  const {node, live, view, pairing} = input
  const pool =
    view === null ? input.pool : pairing.candidates.filter((candidate) => inside({view: candidate, anchor: view}))
  const level = voteLevel({
    ...pairing,
    nodes: node.children.flatMap((child) => pairing.views.get(child.id) ?? []),
    candidates: pool,
  })
  const children = node.children.map((child) => {
    const taken = level.assignments.get(child.id)
    return pairNode({
      node: child,
      live: taken === undefined ? null : (pairing.components.get(taken.candidate.key) ?? null),
      view: taken?.candidate ?? null,
      confidence: taken?.score ?? 0,
      pool,
      pairing,
    })
  })
  const {children: _children, ...own} = node
  return {
    match: {
      node: own,
      live: live === null ? null : omit(live, ['children']),
      confidence: live === null ? 0 : input.confidence,
      source: 'dom',
      deltas: [],
      status: live === null ? 'unbuilt' : 'paired',
      since: '',
      children: children.map((child) => child.match),
    },
    partial: level.partial || children.some((child) => child.partial),
    carried: children.reduce((sum, child) => sum + child.carried, level.carried),
  }
}

function carriedRecords(input: {previous: Match | null; fingerprint: Geometry['fingerprint']}): Map<string, Carried> {
  const {previous, fingerprint} = input
  if (previous === null) return new Map()
  return new Map(
    [...walk({root: previous})].flatMap(({node: match, depth}): [string, Carried][] =>
      depth === 0 || match.live === null
        ? []
        : [
            [
              match.node.id,
              {path: match.live.path, fingerprint: fingerprint(match.live), confidence: match.confidence},
            ],
          ],
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

function heldNodes(root: DesignNode): Held[] {
  return [...walk({root})].flatMap(({node, parent, depth}): Held[] => {
    if (node.kind !== 'box' || parent === null) return []
    const drawn = parent.children.filter(
      (sibling) => sibling.kind === 'text' && holds({outer: node.box, inner: sibling.box}),
    )
    return [{node, parent: depth > 1 ? parent : null, held: [...node.children, ...drawn]}]
  })
}

function nodeViews(input: {root: DesignNode; held: Held[]}): Map<string, VoteView> {
  const visits = [...walk({root: input.root})].filter((visit) => visit.depth > 0)
  const said = groupBy(
    visits.flatMap(({node}) => (node.kind === 'text' ? [spaced(node.text)] : [])),
    (text) => text,
  )
  const ranks = siblingRanks(input.root)
  const controls = controlBoxes(input.held)
  const views = new Map<string, VoteView>()
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

function nodeClass(input: {node: DesignNode; within: DesignNode | null; controls: Set<string>}): VoteView['klass'] {
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

function spaced(text: string): string {
  return text.split(' ').filter(Boolean).join(' ')
}

function toRgb(color: string): Rgb | null {
  const parsed = parse(color)
  if (parsed === undefined || parsed.mode !== 'rgb') return null
  return [Math.round(parsed.r * 255), Math.round(parsed.g * 255), Math.round(parsed.b * 255)]
}

function elementViews(components: LiveComponent[]): VoteView[] {
  return viewTree({components, parent: null}).filter((view) => !collapsed(view))
}

type Built = VoteView & {children: VoteView[]}

function viewTree(input: {components: LiveComponent[]; parent: VoteView | null}): Built[] {
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

function elementClass(input: {component: LiveComponent; lines: Box[]}): VoteView['klass'] {
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
  const {voters} = input
  const base: Weights = new Map(voters.map((voter) => [voter.name, voter.base]))
  const tallies = input.nodes.flatMap((node) => {
    const pool = candidatePool({input, node}).map((candidate) => weighed({input, weights: base, node, candidate}))
    const consensus = pool.reduce<Scored | null>(
      (best, entry) => (best === null || entry.score > best.score ? entry : best),
      null,
    )
    if (consensus === null || consensus.score < input.tolerances.pairFloor) return []
    return voters.flatMap((voter) => {
      const own = pool.filter((entry) => entry.votes[voter.name] !== null)
      if (own.length === 0 || consensus.votes[voter.name] === null) return []
      const top = Math.max(...own.map((entry) => entry.votes[voter.name] ?? 0))
      const agrees = (consensus.votes[voter.name] ?? 0) >= top - TIE
      return [{name: voter.name, agrees}]
    })
  })
  const byVoter = Map.groupBy(tallies, (tally) => tally.name)
  return new Map(
    voters.map((voter) => {
      const tally = byVoter.get(voter.name)
      if (tally === undefined) return [voter.name, voter.base]
      const agreement = tally.filter((entry) => entry.agrees).length / tally.length
      return [voter.name, voter.base * Math.max(input.tolerances.pairMinWeight, agreement)]
    }),
  )
}

function candidatePool(input: {input: VoteInput; node: VoteView}): VoteView[] {
  return input.input.candidates.filter((candidate) => elementCompatible({node: input.node, candidate}))
}

function elementCompatible(input: {node: VoteView; candidate: VoteView}): boolean {
  const {node, candidate} = input
  const own = candidate.lines.length > 0 && candidate.text !== ''
  if (node.kind === 'text') return own
  if (node.kind === 'image') return !own
  return true
}

function weighed(input: {input: VoteInput; weights: Weights; node: VoteView; candidate: VoteView}): Scored {
  const {node, candidate, weights} = input
  const {context} = input.input
  const {voters} = input.input
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

function floors(input: VoteInput & {weights: Weights}): Map<string, number> {
  const {weights} = input
  return new Map(
    input.nodes.map((node) => [
      node.key,
      median0(candidatePool({input, node}).map((candidate) => weighed({input, weights, node, candidate}).score)),
    ]),
  )
}

function voteLevel(input: Pairing & {nodes: VoteView[]}): Level {
  const {weights, state, nodes, context, floors: pools} = input
  if (nodes.length === 0) return {assignments: new Map(), partial: false, carried: 0}
  const pinned = pinsFirst({input, state})
  const fitted = exactFits({input, weights, state})
  const carried = carryFirst({input, state, carried: carriedViews(input)})
  const views = new Map(nodes.map((node) => [node.key, node]))
  const open = (held: boolean): Map<string, Scored[]> =>
    new Map(
      nodes
        .filter((node) => !context.assigned.has(node.key) && input.holders.has(node.key) === held)
        .map((node) => [node.key, scoredList({input, weights, state, node})]),
    )
  const first = greedy({
    input,
    weights,
    state,
    pools,
    lists: open(false),
    views,
    matched: [...pinned, ...fitted, ...carried],
  })
  const followed = followTexts({input, weights, state})
  const result = greedy({
    input,
    weights,
    state,
    pools,
    lists: open(true),
    views,
    matched: [...first.matched, ...followed],
  })
  return {
    assignments: new Map(result.matched.map((entry) => [entry.node.key, entry])),
    partial: first.partial || result.partial,
    carried: carried.length,
  }
}

function carriedViews(input: Pairing & {nodes: VoteView[]}): Assignment[] {
  const {nodes, candidates, records, prints, tolerances} = input
  return nodes.flatMap((node): Assignment[] => {
    const record = records.get(node.key)
    if (record === undefined) return []
    const wanted = record.fingerprint
    const matches = candidates.filter((candidate) => {
      const found = prints.get(candidate.key)
      if (found === undefined) return false
      if (wanted.source === null && candidate.key !== record.path) return false
      return samePrint({a: found, b: wanted, margin: tolerances.tileMargin})
    })
    const candidate =
      matches.find((entry) => entry.key === record.path) ??
      minBy(matches, (entry) => Math.hypot(entry.box.x - wanted.box.x, entry.box.y - wanted.box.y))
    return candidate === undefined ? [] : [{node, candidate, score: record.confidence}]
  })
}

function samePrint(input: {a: Fingerprint; b: Fingerprint; margin: number}): boolean {
  const {a, b} = input
  if (a.key !== null && b.key !== null) return a.key === b.key && a.instance === b.instance
  return (
    a.tag === b.tag &&
    a.textHash === b.textHash &&
    locationKey(a.source) === locationKey(b.source) &&
    withinMargin(input)
  )
}

function locationKey(source: Fingerprint['source']): string {
  return source === null ? '' : `${source.file}:${source.line}:${source.column}`
}

function withinMargin(input: {a: Fingerprint; b: Fingerprint; margin: number}): boolean {
  const {a, b, margin} = input
  const edges = [a.box.x - b.box.x, a.box.y - b.box.y, a.box.w - b.box.w, a.box.h - b.box.h]
  return edges.every((edge) => Math.abs(edge) <= margin)
}

function carryFirst(input: {input: VoteInput; state: State; carried: Assignment[]}): Assignment[] {
  const {state} = input
  const {context, tolerances} = input.input
  const [agreeing, rest] = partition(
    input.carried,
    ({node, candidate}) => node.kind === 'text' && saysSame({node, candidate}),
  )
  return [...agreeing, ...rest].flatMap((entry) => {
    const {node, candidate} = entry
    if (context.assigned.has(node.key)) return []
    if (!elementCompatible({node, candidate})) return []
    if (node.kind === 'text' && !saysSame({node, candidate}) && !sharesWord({node, candidate})) return []
    if (spokenElsewhere({node, candidate, context})) return []
    if (node.kind !== 'text' && !elementGate({node, candidate, state, tolerances})) return []
    if (node.kind !== 'text' && displaced({input: input.input, state, node, candidate})) return []
    take({node, candidate, state, context})
    return [entry]
  })
}

function sharesWord(input: {node: VoteView; candidate: VoteView}): boolean {
  return intersection(input.node.text.split(' '), input.candidate.text.split(' ')).length > 0
}

function displaced(input: {input: VoteInput; state: State; node: VoteView; candidate: VoteView}): boolean {
  const {node, candidate, state} = input
  const exact = input.input.tolerances.pairExactIou
  if (iou({a: node.box, b: candidate.box}) >= exact) return false
  return candidatePool({input: input.input, node}).some(
    (other) => other !== candidate && !state.boxes.has(other.key) && iou({a: node.box, b: other.box}) >= exact,
  )
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

function take(input: {node: VoteView; candidate: VoteView; state: State; context: VoteContext}): void {
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

function scoredList(input: {input: VoteInput; weights: Weights; state: State; node: VoteView}): Scored[] {
  const {node, state, weights} = input
  const {tolerances} = input.input
  return candidatePool({input: input.input, node})
    .filter((candidate) => elementGate({node, candidate, state, tolerances}))
    .map((candidate) => weighed({input: input.input, weights, node, candidate}))
    .toSorted((a, b) => b.score - a.score)
}

function elementGate(input: {node: VoteView; candidate: VoteView; state: State; tolerances: Tolerances}): boolean {
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

function greedy(input: {
  input: VoteInput
  weights: Weights
  state: State
  pools: Map<string, number>
  lists: Map<string, Scored[]>
  views: Map<string, VoteView>
  matched: Assignment[]
}): {matched: Assignment[]; partial: boolean} {
  const {state, pools, lists, views} = input
  const {context, tolerances, deadline} = input.input
  if (Date.now() > deadline) return {matched: input.matched, partial: true}
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
  if (best === null) return {matched: input.matched, partial: false}
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

function spokenElsewhere(input: {node: VoteView; candidate: VoteView; context: VoteContext}): boolean {
  const {node, candidate, context} = input
  if (node.kind !== 'text' || candidate.words === '' || saysSame({node, candidate})) return false
  return (context.spoken[candidate.words] ?? []).some((other) => other !== node && !context.assigned.has(other.key))
}

function saysSame(input: {node: VoteView; candidate: VoteView}): boolean {
  return input.node.words === input.candidate.words
}

function passes(input: {node: VoteView; list: Scored[]; floor: number; state: State; tolerances: Tolerances}): boolean {
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

function enclosing(view: VoteView): VoteView | null {
  const climb = (from: VoteView | null): VoteView | null => {
    if (from === null || from.parent === null) return null
    return holds({outer: from.box, inner: view.box}) ? from : climb(from.parent)
  }
  return climb(view.parent)
}

function flatten(components: LiveComponent[]): LiveComponent[] {
  return components.flatMap((component) => [component, ...flatten(component.children)])
}

function median0(values: number[]): number {
  return values.length === 0 ? 0 : median(values)
}

function inside(input: {view: VoteView; anchor: VoteView}): boolean {
  if (input.view === input.anchor) return true
  const parent = input.view.parent
  return parent !== null && inside({view: parent, anchor: input.anchor})
}
