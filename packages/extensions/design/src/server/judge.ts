import {maxBy, pick} from 'es-toolkit'
import type {Box, Judge, Match, Run} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'
import {box} from '../shared/box.js'
import {itemsOf} from './items.js'

export function createJudge(input: {config: DesignConfig}): Judge {
  const distance = designConfig.colorMetrics[input.config.color]
  return (request) => judged({...request, distance})
}

type DesignConfig = ReturnType<typeof designConfig.parse>

type Item = Run['items'][number]

type Stage = NonNullable<Run['stage']>

type Stop = NonNullable<Run['stop']>

type Distance = (input: {a: string; b: string}) => number

type Request = Parameters<Judge>[0] & {distance: Distance}

type Status = Match['status']

type Prior = {
  path: Run['path']
  round: number
  score: number[]
  stage: Stage | null
  capture: string
  values: Map<string, number | string>
}

const TOLERANCES = designConfig.tolerances

const STAGES = ['structure', 'content', 'geometry', 'paint'] as const satisfies readonly Stage[]

function judged(input: Request): ReturnType<Judge> {
  const {distance} = input
  const root = {...input.root, deltas: [...input.root.deltas, ...input.warnings]}
  const found = itemsOf({root, extras: input.extras, distance})
  const excluded = new Set(
    input.decisions.flatMap((decision) => (decision.kind === 'excluded' ? [decision.anchor] : [])),
  )
  const items = found.items.filter((item) => item.node === undefined || !excluded.has(item.node))
  const before = statuses(input.previous)
  const accepted = new Set([
    ...input.accepted,
    ...input.decisions.filter((decision) => decision.kind === 'accept-node').map((decision) => decision.anchor),
  ])
  const restated = restate({match: root, depth: 0, before, accepted, run: input.run, items})
  const regressed = newlyRegressed({root: restated, before})
  const rounds = input.rounds.toSorted((a, b) => a.round - b.round)
  const section = input.section === undefined ? null : sectionMatch({root: restated, id: input.section})
  const shares = (area: Box): {unpaired: number; residual: number} => ({
    unpaired: unpairedShare({root: section ?? restated, unbuilt: found.unbuilt, area}),
    residual: residualShare({
      tiles: found.tiles,
      explained: section === null ? [...found.explained, ...input.excluded] : found.explained,
      area,
    }),
  })
  if (section === null) {
    const {unpaired, residual} = shares(pageBox(root))
    const score = scoreTuple({items, unpairedShare: unpaired, residualShare: residual})
    const priors = rounds.filter((run) => run.path === input.path).map((run) => priorOf({run, distance}))
    const verdict = verdictOf({items, score, priors, regressed, capture: input.capture, distance})
    return {root: restated, score, ...verdict, stop: input.partial ? null : verdict.stop}
  }
  const area = roundedBox(section.node.box)
  const nodes = new Set([...walk(section)].map(({node}) => node.node.id))
  const held = items.filter((item) => heldBy({item, nodes, area}))
  const {unpaired, residual} = shares(area)
  const score = scoreTuple({items: held, unpairedShare: unpaired, residualShare: residual})
  const verdict = verdictOf({items: held, score, priors: [], regressed, capture: input.capture, distance})
  const built = [...walk(section)].some(({node}) => node.live !== null)
  const open = !built || input.partial || held.some((item) => item.stage !== null)
  const spent = roundsUsed({section: section.node.id, rounds})
  return {
    root: restated,
    score,
    stage: verdict.stage,
    stop: sectionStop({open, spent: open && spent >= TOLERANCES.roundBudget}),
    items: verdict.items.map((item) => ({...item, spent, unpaired, residual})),
  }
}

function roundsUsed(input: {section: string; rounds: Run[]}): number {
  const hashes = input.rounds.map((run) => sectionMatch({root: run.root, id: input.section})?.hash ?? null)
  return input.rounds.filter(
    (run, index) => index > 0 && run.section === input.section && hashes[index] !== hashes[index - 1],
  ).length
}

function sectionStop(input: {open: boolean; spent: boolean}): Stop | null {
  if (!input.open) return 'done'
  return input.spent ? 'budget' : null
}

function sectionMatch(input: {root: Match; id: string}): Match | null {
  return input.root.children.find((child) => child.node.id === input.id) ?? null
}

function heldBy(input: {item: Item; nodes: Set<string>; area: Box}): boolean {
  const {item, nodes, area} = input
  if (item.node !== undefined) return nodes.has(item.node)
  return box.encloses({inner: item.box, outer: area})
}

function verdictOf(input: {
  items: Item[]
  score: number[]
  priors: Prior[]
  regressed: Set<string>
  capture: string
  distance: Distance
}): Pick<ReturnType<Judge>, 'stage' | 'stop' | 'items'> {
  const {items, score, priors, regressed, capture, distance} = input
  const counted = items.filter((item) => item.stage !== null)
  const demoted = new Set(counted.filter((item) => unchangedLately({item, priors, distance})).map((item) => item.key))
  const stage = firstStage(counted.filter((item) => !demoted.has(item.key))) ?? firstStage(counted)
  const ranked = ranking(counted.filter((item) => item.stage === stage))
  const kept = [...ranked.filter((item) => !demoted.has(item.key)), ...ranked.filter((item) => demoted.has(item.key))]
  const dirtied = (item: Item): boolean => item.node !== undefined && regressed.has(item.node)
  const ordered = [...kept.filter(dirtied), ...kept.filter((item) => !dirtied(item))]
  const later = STAGES.filter((other) => other !== stage).flatMap((other) =>
    ranking(counted.filter((item) => item.stage === other)),
  )
  const flipped = flippedBack({counted, priors, distance})
  const flips = new Set(flipped?.items.map((item) => item.key) ?? [])
  const tagged = (item: Item): Item => ({
    ...item,
    ...(demoted.has(item.key) ? {demoted: true} : {}),
    ...(flipped !== null && flips.has(item.key) ? {flipped: flipped.round} : {}),
  })
  return {
    stage,
    stop: stopReason({counted, score, priors, stage, capture}),
    items: [...ordered, ...later, ...ranking(items.filter((item) => item.stage === null))].map(tagged),
  }
}

function ranking(items: Item[]): Item[] {
  return items.toSorted(
    (a, b) => b.confidence * b.size - a.confidence * a.size || a.box.y - b.box.y || a.depth - b.depth,
  )
}

function firstStage(items: Item[]): Stage | null {
  return STAGES.find((stage) => items.some((item) => item.stage === stage)) ?? null
}

function priorOf(input: {run: Run; distance: Distance}): Prior {
  const {run, distance} = input
  const {items} = itemsOf({root: run.root, extras: run.extras, distance})
  return {
    round: run.round,
    score: run.score,
    stage: run.stage,
    path: run.path,
    capture: run.capture,
    values: new Map(items.filter((item) => item.stage !== null).map((item) => [item.key, item.value])),
  }
}

function same(input: {a: number | string | undefined; b: number | string | undefined; distance: Distance}): boolean {
  const {a, b, distance} = input
  if (a === undefined || b === undefined) return false
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= TOLERANCES.geometryPx
  if (typeof a === 'string' && typeof b === 'string' && a.startsWith('#') && b.startsWith('#')) {
    return distance({a, b}) <= TOLERANCES.colorDeltaE
  }
  return a === b
}

function unchangedLately(input: {item: Item; priors: Prior[]; distance: Distance}): boolean {
  const {item, priors, distance} = input
  const recent = priors.slice(-TOLERANCES.stallRounds)
  if (recent.length < TOLERANCES.stallRounds) return false
  return recent.every((prior) => same({a: prior.values.get(item.key), b: item.value, distance}))
}

function flippedBack(input: {counted: Item[]; priors: Prior[]; distance: Distance}): {
  items: Item[]
  round: number
} | null {
  const {counted, priors, distance} = input
  const previous = priors.at(-1)
  const earlier = priors.at(-2)
  if (previous === undefined || earlier === undefined) return null
  const items = counted.filter((item) => {
    const last = previous.values.get(item.key)
    const older = earlier.values.get(item.key)
    if (last === undefined || older === undefined) return false
    return !same({a: item.value, b: last, distance}) && same({a: item.value, b: older, distance})
  })
  return items.length === 0 ? null : {items, round: earlier.round}
}

function stopReason(input: {
  counted: Item[]
  score: number[]
  priors: Prior[]
  stage: Stage | null
  capture: string
}): Stop | null {
  const {counted, score, priors, stage, capture} = input
  if (counted.length === 0) {
    return (score.at(-1) ?? 0) < TOLERANCES.residualAreaGate ? 'done' : 'residual-only'
  }
  if (stage !== null && oscillating({score, priors, stage})) return 'oscillating'
  if (stage !== null && stalled({score, priors, stage, capture})) return 'stalled'
  return null
}

function oscillating(input: {score: number[]; priors: Prior[]; stage: Stage}): boolean {
  const {score, priors, stage} = input
  const at = stageColumn(stage)
  const totals = [...priors.map((prior) => prior.score[at] ?? 0), score[at] ?? 0]
  const tolerance = STAGE_TOLERANCES[stage]
  const chain = totals.reduce<{lowest: number; reversals: number}>(
    (state, total, index) => {
      if (total < state.lowest - tolerance) return {lowest: total, reversals: 0}
      const reversed = reversal({first: totals[index - 2], second: totals[index - 1], now: total, tolerance})
      return {lowest: state.lowest, reversals: reversed ? state.reversals + 1 : 0}
    },
    {lowest: Number.POSITIVE_INFINITY, reversals: 0},
  )
  return chain.reversals >= REVERSALS_TO_STOP
}

function reversal(input: {
  first: number | undefined
  second: number | undefined
  now: number
  tolerance: number
}): boolean {
  const {first, second, now, tolerance} = input
  if (first === undefined || second === undefined) return false
  const previousMove = second - first
  const move = now - second
  return previousMove !== 0 && Math.abs(move) > tolerance && Math.sign(move) !== Math.sign(previousMove)
}

function stalled(input: {score: number[]; priors: Prior[]; stage: Stage; capture: string}): boolean {
  const {score, priors, stage, capture} = input
  const at = stageColumn(stage)
  const tolerance = STAGE_TOLERANCES[stage]
  const chain = [
    ...priors.slice(-TOLERANCES.stallRounds).map((prior) => pick(prior, ['score', 'capture', 'stage'])),
    {score, capture, stage},
  ]
  if (chain.length <= TOLERANCES.stallRounds) return false
  return chain.slice(1).every((entry, index) => {
    const earlier = chain[index]
    if (earlier === undefined || entry.stage !== stage || earlier.stage !== stage) return false
    if (entry.capture === earlier.capture) return false
    return Math.abs((entry.score[at] ?? 0) - (earlier.score[at] ?? 0)) < tolerance
  })
}

function stageColumn(stage: Stage): number {
  return 1 + STAGES.indexOf(stage)
}

function statuses(previous: Run | null): Map<string, Match> {
  if (previous === null) return new Map()
  return new Map(
    [...walk(previous.root)].flatMap(({node, depth}) => (depth === 0 ? [] : [[node.node.id, node] as const])),
  )
}

function restate(input: {
  match: Match
  depth: number
  before: Map<string, Match>
  accepted: Set<string>
  run: string
  items: Item[]
}): Match {
  const {match, depth, before, accepted, run, items} = input
  const children = match.children.map((child) => restate({...input, match: child, depth: depth + 1}))
  if (depth === 0) return {...match, children}
  const previous = before.get(match.node.id) ?? null
  const observed: Status =
    match.live === null ? 'unbuilt' : worstItem({items, node: match.node.id}) === null ? 'done' : 'paired'
  const status = nextStatus({was: previous?.status ?? 'unbuilt', now: observed, accepted: accepted.has(match.node.id)})
  const since = previous !== null && previous.status === status ? previous.since : run
  return {...match, status, since, children}
}

function nextStatus(input: {was: Status; now: Status; accepted: boolean}): Status {
  const {was, now} = input
  if (input.accepted) return 'accepted'
  if (now === 'done') return 'done'
  if (was === 'unbuilt') return now
  if (was === 'paired' && now === 'paired') return 'paired'
  return 'regressed'
}

function newlyRegressed(input: {root: Match; before: Map<string, Match>}): Set<string> {
  return new Set(
    [...walk(input.root)].flatMap(({node, depth}) =>
      depth > 0 && node.status === 'regressed' && input.before.get(node.node.id)?.status !== 'regressed'
        ? [node.node.id]
        : [],
    ),
  )
}

function worstItem(input: {items: Item[]; node: string}): Item | null {
  return (
    maxBy(
      input.items.filter((item) => item.node === input.node && item.stage !== null),
      (item) => item.size,
    ) ?? null
  )
}

function scoreTuple(input: {items: Item[]; unpairedShare: number; residualShare: number}): number[] {
  const counted = input.items.filter((item) => item.stage !== null)
  const sums = STAGES.map((stage) =>
    rounded(counted.filter((item) => item.stage === stage).reduce((sum, item) => sum + item.size, 0)),
  )
  return [rounded(input.unpairedShare), ...sums, rounded(input.residualShare)]
}

function unpairedShare(input: {root: Match; unbuilt: ReturnType<typeof itemsOf>['unbuilt']; area: Box}): number {
  const covered = [...walk(input.root)]
    .filter(({node}) => input.unbuilt.get(node.node.id)?.stage === 'structure')
    .reduce((sum, {node}) => sum + node.node.box.w * node.node.box.h, 0)
  const total = input.area.w * input.area.h
  return total === 0 ? 0 : Math.min(1, covered / total)
}

function residualShare(input: {tiles: Box[]; explained: Box[]; area: Box}): number {
  const {tiles, explained, area} = input
  const total = area.w * area.h
  if (tiles.length === 0 || total === 0) return 0
  const within = roundedBox(area)
  const shown = box.mask({boxes: tiles.map(roundedBox), within})
  const covered = box.mask({boxes: explained.map(roundedBox), within})
  const count = shown.reduce((sum, value, index) => sum + (value === 1 && covered[index] !== 1 ? 1 : 0), 0)
  return count / total
}

function pageBox(root: Match): Box {
  return root.live?.box ?? root.node.box
}

function roundedBox(area: Box): Box {
  return {x: Math.round(area.x), y: Math.round(area.y), w: Math.round(area.w), h: Math.round(area.h)}
}

function rounded(value: number): number {
  return Math.round(value * SCORE_PRECISION) / SCORE_PRECISION
}

const SCORE_PRECISION = 10_000

const REVERSALS_TO_STOP = 2

const STAGE_TOLERANCES: Record<Stage, number> = {
  structure: 1,
  content: 1,
  geometry: TOLERANCES.geometryPx,
  paint: TOLERANCES.colorDeltaE,
}
