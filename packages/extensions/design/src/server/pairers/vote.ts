import {createHash} from 'node:crypto'
import {groupBy, median, omit} from 'es-toolkit'
import type {Box, DesignNode, LiveComponent, Match, Pairer} from '../../shared/defs.js'
import {box} from '../../shared/box.js'
import {designConfig} from '../../shared/tolerances.js'
import {walk} from '../../shared/tree.js'
import {createSimilarity} from './similarity.js'
import {fingerprints} from './fingerprints.js'

export function createVotePairer(): Pairer {
  return (request) => Promise.resolve(pairDesign(request))
}

type Similarity = ReturnType<typeof createSimilarity>

type Voter = Similarity['voters'][number]

type VoterName = Voter['name']

type View = Parameters<Voter['score']>[0]['node']

type Context = Parameters<Voter['score']>[0]['context']

type Votes = Record<VoterName, number | null>

type Scored = {candidate: View; score: number; votes: Votes}

type State = {boxes: Set<string>; texts: Map<string, Box[]>; trusted: Set<VoterName>}

type Assignment = {node: View; candidate: View; score: number}

type Weights = Map<VoterName, number>

type VoteInput = {
  nodes: View[]
  candidates: View[]
  context: Context
  holders: Map<string, string>
  pins: {node: string; path: string}[]
  deadline: number
}

type Pairing = Omit<VoteInput, 'nodes'> & {
  weights: Weights
  floors: Map<string, number>
  state: State
  views: Map<string, View>
  components: Map<string, LiveComponent>
}

type Level = {assignments: Map<string, Assignment>; partial: boolean}

type Paired = {match: Match; partial: boolean}

const SIMILARITY = createSimilarity()

const TOLERANCES = designConfig.tolerances

const TIE = 1e-9

function pairDesign(input: Parameters<Pairer>[0]): Awaited<ReturnType<Pairer>> {
  const {design, measured, target, pins, budget} = input
  const root = design.root
  const {views, holders} = SIMILARITY.views.design(root)
  const nodes = [...views.values()]
  const candidates = SIMILARITY.views.live(measured.live.children)
  const components = new Map(
    [...walk(measured.live)].flatMap(({node, depth}): [string, LiveComponent][] =>
      depth === 0 ? [] : [[node.path, node]],
    ),
  )
  const context: Context = {
    assigned: new Map(),
    diagonal: Math.hypot(root.box.w, root.box.h) || 1,
    nodeRaster: target,
    candidateRaster: measured.raster,
    hashes: new Map(),
    twins: new Map(),
    candidates,
    bestText: new Map(),
    spoken: groupBy(
      nodes.filter((node) => node.kind === 'text' && node.words !== ''),
      (node) => node.words,
    ),
  }
  const shared = {candidates, context, holders, pins, deadline: Date.now() + budget}
  const weights = calibrate({...shared, nodes})
  const trusted = new Set(
    SIMILARITY.voters.filter((voter) => (weights.get(voter.name) ?? 0) >= voter.base / 2).map((voter) => voter.name),
  )
  const pairing: Pairing = {
    ...shared,
    weights,
    floors: floors({...shared, nodes, weights}),
    state: {boxes: new Set(), texts: new Map(), trusted},
    views,
    components,
  }
  const {match, partial} = pairNode({
    node: root,
    live: measured.live,
    view: null,
    confidence: 1,
    pool: candidates,
    pairing,
  })
  return {root: match, partial}
}

function pairNode(input: {
  node: DesignNode
  live: LiveComponent | null
  view: View | null
  confidence: number
  pool: View[]
  pairing: Pairing
}): Paired {
  const {node, pairing} = input
  const {live, view, seats} = seated(input)
  const pool =
    view === null
      ? input.pool
      : pairing.candidates.filter((candidate) => SIMILARITY.views.inside({view: candidate, anchor: view}))
  const open = (child: DesignNode): boolean => !seats.has(child.id)
  const level = voteLevel({
    ...pairing,
    nodes: node.children.flatMap((child) => (open(child) ? (pairing.views.get(child.id) ?? []) : [])),
    candidates: pool,
  })
  const missed = node.children.flatMap((child) =>
    pool === pairing.candidates || !open(child) || level.assignments.has(child.id)
      ? []
      : (pairing.views.get(child.id) ?? []),
  )
  const wider = voteLevel({...pairing, nodes: missed, candidates: pairing.candidates})
  const voted = node.children.map((child): Paired => {
    const seat = seats.get(child.id)
    const taken = seat === undefined ? (level.assignments.get(child.id) ?? wider.assignments.get(child.id)) : undefined
    const candidate = seat ?? taken?.candidate ?? null
    return pairNode({
      node: child,
      live: candidate === null ? null : (pairing.components.get(candidate.key) ?? null),
      view: candidate,
      confidence: seat === undefined ? (taken?.score ?? 0) : input.confidence,
      pool,
      pairing,
    })
  })
  const children = heldLate({node, voted, pairing})
  return {
    match: matched({
      node,
      live,
      confidence: live === null ? 0 : input.confidence,
      children: children.map((child) => child.match),
    }),
    partial: level.partial || wider.partial || children.some((child) => child.partial),
  }
}

function seated(input: {node: DesignNode; live: LiveComponent | null; view: View | null; pairing: Pairing}): {
  live: LiveComponent | null
  view: View | null
  seats: Map<string, View>
} {
  const {node, live, view, pairing} = input
  if (view === null || !pairing.views.has(node.id)) return {live, view, seats: new Map()}
  const {candidates, state, context} = pairing
  const seats = SIMILARITY.views.coinciding({node, view, candidates, taken: state.boxes})
  seats.forEach((seat, id) => {
    const at = pairing.views.get(id)
    if (at !== undefined) take({node: at, candidate: seat, state, context})
  })
  const own = seats.get(node.id) ?? view
  return {live: pairing.components.get(own.key) ?? live, view: own, seats}
}

function heldLate(input: {node: DesignNode; voted: Paired[]; pairing: Pairing}): Paired[] {
  const {node, voted, pairing} = input
  const open = node.children.flatMap((child) =>
    pairing.context.assigned.has(child.id) ? [] : (pairing.views.get(child.id) ?? []),
  )
  const late = new Map(
    followTexts({input: {...pairing, nodes: open}, weights: pairing.weights, state: pairing.state}).map(
      (entry) => [entry.node.key, entry] as const,
    ),
  )
  return voted.map((entry, index) => {
    const follow = late.get(entry.match.node.id)
    const child = node.children[index]
    if (follow === undefined || child === undefined) return entry
    const live = pairing.components.get(follow.candidate.key) ?? null
    return {...entry, match: matched({node: child, live, confidence: follow.score, children: entry.match.children})}
  })
}

function matched(input: {node: DesignNode; live: LiveComponent | null; confidence: number; children: Match[]}): Match {
  const {node, live, confidence, children} = input
  const {children: _children, ...own} = node
  const hash = createHash('sha256')
    .update(JSON.stringify(live === null ? null : fingerprints.of(live)))
    .update(children.map((child) => child.hash).join(''))
    .digest('hex')
  return {
    node: own,
    live: live === null ? null : omit(live, ['children']),
    hash,
    confidence,
    children,
  }
}

function calibrate(input: VoteInput): Weights {
  const voters = SIMILARITY.voters
  const base: Weights = new Map(voters.map((voter) => [voter.name, voter.base]))
  const tallies = input.nodes.flatMap((node) => {
    const pool = candidatePool({input, node}).map((candidate) => weighed({input, weights: base, node, candidate}))
    const consensus = pool.reduce<Scored | null>(
      (best, entry) => (best === null || entry.score > best.score ? entry : best),
      null,
    )
    if (consensus === null || consensus.score < TOLERANCES.pairFloor) return []
    return voters.flatMap((voter) => {
      const own = pool.filter((entry) => entry.votes[voter.name] !== null)
      if (own.length === 0 || consensus.votes[voter.name] === null) return []
      const top = Math.max(...own.map((entry) => entry.votes[voter.name] ?? 0))
      return [{name: voter.name, agrees: (consensus.votes[voter.name] ?? 0) >= top - TIE}]
    })
  })
  const byVoter = Map.groupBy(tallies, (tally) => tally.name)
  return new Map(
    voters.map((voter) => {
      const tally = byVoter.get(voter.name)
      if (tally === undefined) return [voter.name, voter.base]
      const agreement = tally.filter((entry) => entry.agrees).length / tally.length
      return [voter.name, voter.base * Math.max(TOLERANCES.pairMinWeight, agreement)]
    }),
  )
}

function candidatePool(input: {input: VoteInput; node: View}): View[] {
  return input.input.candidates.filter((candidate) => SIMILARITY.views.compatible({node: input.node, candidate}))
}

function weighed(input: {input: VoteInput; weights: Weights; node: View; candidate: View}): Scored {
  const {node, candidate, weights} = input
  const {context} = input.input
  const votes: Votes = {
    text: null,
    kind: null,
    structure: null,
    style: null,
    geometry: null,
    pixel: null,
    hints: null,
    twins: null,
  }
  SIMILARITY.voters.forEach((voter) => {
    votes[voter.name] = voter.score({node, candidate, context})
  })
  const applied = SIMILARITY.voters.filter((voter) => votes[voter.name] !== null)
  const total = applied.reduce((sum, voter) => sum + (weights.get(voter.name) ?? 0), 0)
  const sum = applied.reduce((acc, voter) => acc + (weights.get(voter.name) ?? 0) * (votes[voter.name] ?? 0), 0)
  return {candidate, score: total === 0 ? 0 : sum / total, votes}
}

function floors(input: VoteInput & {weights: Weights}): Map<string, number> {
  const {weights} = input
  return new Map(
    input.nodes.map((node) => {
      const scores = candidatePool({input, node}).map((candidate) => weighed({input, weights, node, candidate}).score)
      return [node.key, scores.length === 0 ? 0 : median(scores)]
    }),
  )
}

function voteLevel(input: Pairing & {nodes: View[]}): Level {
  const {weights, state, nodes, context, floors: pools} = input
  if (nodes.length === 0) return {assignments: new Map(), partial: false}
  const pinned = pinsFirst({input, state})
  const fitted = exactFits({input, weights, state})
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
    matched: [...pinned, ...fitted],
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
  }
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
        .filter((candidate) => SIMILARITY.box.same({a: node.box, b: candidate.box}))
        .map((candidate) => ({node, candidate, apart: SIMILARITY.box.apart({a: node.box, b: candidate.box})})),
    )
    .toSorted((a, b) => a.apart - b.apart)
  return fits.flatMap(({node, candidate}): Assignment[] => {
    if (context.assigned.has(node.key) || state.boxes.has(candidate.key)) return []
    const {score} = weighed({input: input.input, weights, node, candidate})
    take({node, candidate, state, context})
    return [{node, candidate, score}]
  })
}

function scoredList(input: {input: VoteInput; weights: Weights; state: State; node: View}): Scored[] {
  const {node, state, weights} = input
  return candidatePool({input: input.input, node})
    .filter((candidate) => elementGate({node, candidate, state}))
    .map((candidate) => weighed({input: input.input, weights, node, candidate}))
    .toSorted((a, b) => b.score - a.score)
}

function elementGate(input: {node: View; candidate: View; state: State}): boolean {
  const {node, candidate, state} = input
  if (node.kind !== 'text') {
    if (state.boxes.has(candidate.key)) return false
    const larger = Math.max(box.area(node.box), box.area(candidate.box))
    const smaller = Math.max(1, Math.min(box.area(node.box), box.area(candidate.box)))
    return (
      SIMILARITY.box.iou({a: node.box, b: candidate.box}) >= TOLERANCES.pairBoxIou &&
      larger / smaller < TOLERANCES.pairBoxArea
    )
  }
  const reach = box.expand({box: candidate.box, by: TOLERANCES.tileMargin})
  const within = box.holds({outer: reach, inner: {...box.centre(node.box), w: 0, h: 0}})
  return (
    within ||
    (node.alone && node.words === candidate.words) ||
    (!state.trusted.has('geometry') && !state.texts.has(candidate.key))
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
}): {matched: Assignment[]; partial: boolean} {
  const {state, pools, lists, views} = input
  const {context, deadline} = input.input
  if (Date.now() > deadline) return {matched: input.matched, partial: true}
  const ready = [...lists.entries()].flatMap(([key, scored]) => {
    const node = views.get(key)
    if (node === undefined) return []
    const list = scored.filter((entry) => !spokenElsewhere({node, candidate: entry.candidate, context}))
    const top = list[0]
    if (top === undefined || !passes({node, list, floor: pools.get(key) ?? 0, state})) return []
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
        (entry) => entry.candidate !== top.candidate || elementGate({node: other, candidate: entry.candidate, state}),
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

function passes(input: {node: View; list: Scored[]; floor: number; state: State}): boolean {
  const {node, list, floor, state} = input
  const [top, runner] = list
  if (top === undefined) return false
  if (node.kind === 'text' && top.votes.text === null && top.votes.structure === null) return false
  if (top.score < TOLERANCES.pairFloor || top.score < floor + TOLERANCES.pairFloorMargin) return false
  if (runner === undefined || top.score - runner.score >= TOLERANCES.pairMargin) return true
  return dominates({top, runner, trusted: state.trusted})
}

function dominates(input: {top: Scored; runner: Scored; trusted: Set<VoterName>}): boolean {
  const {top, runner, trusted} = input
  const shared = [...trusted].flatMap((name) => {
    const a = top.votes[name]
    const b = runner.votes[name]
    return a === null || b === null ? [] : [a - b]
  })
  return shared.every((gap) => gap >= 0) && shared.some((gap) => gap >= TOLERANCES.pairDominance)
}

function followTexts(input: {input: VoteInput; weights: Weights; state: State}): Assignment[] {
  const {weights, state} = input
  const {nodes, holders, context} = input.input
  return nodes.flatMap((node): Assignment[] => {
    const text = holders.get(node.key)
    if (text === undefined || context.assigned.has(node.key)) return []
    const element = context.assigned.get(text)
    if (element === undefined) return []
    const candidate =
      element.klass === 'control' || element.klass === 'media' ? element : SIMILARITY.views.enclosing(element)
    if (candidate === null || state.boxes.has(candidate.key)) return []
    const {score} = weighed({input: input.input, weights, node, candidate})
    take({node, candidate, state, context})
    return [{node, candidate, score}]
  })
}
