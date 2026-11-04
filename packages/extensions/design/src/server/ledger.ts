import {countBy, maxBy, minBy} from 'es-toolkit'
import {type Ledger, type LedgerCounts, type LedgerEntry, type NodeStatus} from '../shared/defs.js'
import {TOLERANCES} from '../shared/tolerances.js'
import type {Decision, Fingerprint, Item, LiveComponent, Matched, PairRecord, TargetNode} from '../shared/types.js'
import {fingerprint, type Shift} from './pair.js'

export type LedgerChanges = {
  done: string[]
  regressed: string[]
  paired: string[]
  lost: string[]
  moved: {node: string; shift: Shift}[]
}

export function nextLedger(input: {
  earlier: Ledger | null
  run: string
  round: number
  nodes: TargetNode[]
  matched: Matched[]
  items: Item[]
  decisions: Decision[]
  components: LiveComponent[]
}): {ledger: Ledger; changes: LedgerChanges} {
  const {earlier, run, nodes, items} = input
  const found = new Map(input.matched.map((entry) => [entry.node.id, entry]))
  const accepted = new Set(
    input.decisions.filter((decision) => decision.kind === 'accept-node').map((decision) => decision.anchor),
  )
  const entries = nodes.map((node): [string, LedgerEntry] => {
    const previous = earlier?.nodes[node.id] ?? null
    const match = found.get(node.id)
    const item = worstItem({items, node: node.id})
    const status = nextStatus({
      previous: previous?.status ?? 'unbuilt',
      paired: match !== undefined,
      dirty: item !== null,
      accepted: accepted.has(node.id),
    })
    return [
      node.id,
      {
        status,
        since: previous !== null && previous.status === status ? previous.since : run,
        pair: match === undefined ? (previous?.pair ?? null) : livePair({match, run}),
        item,
      },
    ]
  })
  const current = Object.fromEntries(entries)
  const ledger = {run, round: input.round, nodes: {...earlier?.nodes, ...current}}
  if (earlier === null) return {ledger, changes: {done: [], regressed: [], paired: [], lost: [], moved: []}}
  return {ledger, changes: changesBetween({earlier, current, found, components: input.components})}
}

export function ledgerPairs(ledger: Ledger | null): PairRecord[] {
  if (ledger === null) return []
  return Object.entries(ledger.nodes).flatMap(([node, entry]): PairRecord[] => {
    if (entry.pair === null || entry.pair.run !== ledger.run) return []
    const {path, confidence} = entry.pair
    return [{node, path, confidence, fingerprint: entry.pair.fingerprint}]
  })
}

export function ledgerCounts(ledger: Ledger | null): LedgerCounts {
  const counted = countBy(Object.values(ledger?.nodes ?? {}), (entry) => entry.status)
  return {
    unbuilt: counted.unbuilt ?? 0,
    paired: counted.paired ?? 0,
    done: counted.done ?? 0,
    regressed: counted.regressed ?? 0,
    accepted: counted.accepted ?? 0,
  }
}

function worstItem(input: {items: Item[]; node: string}): LedgerEntry['item'] {
  const worst = maxBy(
    input.items.filter((item) => item.node === input.node && item.stage !== null),
    (item) => item.size,
  )
  if (worst === undefined || worst.stage === null) return null
  return {stage: worst.stage, size: worst.size, sentence: worst.sentence}
}

function nextStatus(input: {previous: NodeStatus; paired: boolean; dirty: boolean; accepted: boolean}): NodeStatus {
  const {previous, paired, dirty} = input
  if (input.accepted) return 'accepted'
  if (paired && !dirty) return 'done'
  if (previous === 'unbuilt') return paired ? 'paired' : 'unbuilt'
  if (previous === 'paired' && paired) return 'paired'
  return 'regressed'
}

function livePair(input: {match: Matched; run: string}): LedgerEntry['pair'] {
  const {match, run} = input
  return {path: match.component.path, fingerprint: fingerprint(match.component), confidence: match.confidence, run}
}

function changesBetween(input: {
  earlier: Ledger
  current: Record<string, LedgerEntry>
  found: Map<string, Matched>
  components: LiveComponent[]
}): LedgerChanges {
  const {earlier, current} = input
  const listed = Object.entries(current).filter(([, entry]) => entry.status !== 'accepted')
  const was = (node: string): NodeStatus => earlier.nodes[node]?.status ?? 'unbuilt'
  const newly = (status: NodeStatus): string[] =>
    listed.filter(([node, entry]) => entry.status === status && was(node) !== status).map(([node]) => node)
  const prints = flattened(input.components).map(fingerprintAt)
  const sightings = listed.flatMap(([node, entry]) => {
    const pair = earlier.nodes[node]?.pair
    if (pair === undefined || pair === null || pair.run !== earlier.run) return []
    const now = input.found.has(node) ? entry.pair : null
    if (now !== null) return [{node, sighting: sighted({box: now.fingerprint.box, wanted: pair.fingerprint})}]
    return [{node, sighting: nearestSighting({wanted: pair.fingerprint, path: pair.path, prints})}]
  })
  return {
    done: newly('done'),
    regressed: newly('regressed'),
    paired: listed
      .filter(([node, entry]) => was(node) === 'unbuilt' && (entry.status === 'paired' || entry.status === 'done'))
      .map(([node]) => node),
    lost: sightings.filter(({sighting}) => sighting === null).map(({node}) => node),
    moved: sightings.flatMap(({node, sighting}) =>
      sighting === null || !sighting.outside ? [] : [{node, shift: sighting.shift}],
    ),
  }
}

type Print = {path: string; print: Fingerprint}

function fingerprintAt(component: LiveComponent): Print {
  return {path: component.path, print: fingerprint(component)}
}

function nearestSighting(input: {
  wanted: Fingerprint
  path: string
  prints: Print[]
}): {shift: Shift; outside: boolean} | null {
  const {wanted} = input
  const nearest = minBy(
    input.prints.filter(({path, print}) => sameElement({a: print, b: wanted, path, wantedPath: input.path})),
    ({print}) => Math.hypot(print.box.x - wanted.box.x, print.box.y - wanted.box.y),
  )
  if (nearest === undefined) return null
  return sighted({box: nearest.print.box, wanted})
}

function sighted(input: {box: Fingerprint['box']; wanted: Fingerprint}): {shift: Shift; outside: boolean} {
  const {box, wanted} = input
  const edges = [box.x - wanted.box.x, box.y - wanted.box.y, box.w - wanted.box.w, box.h - wanted.box.h]
  return {
    shift: {dx: Math.round(box.x - wanted.box.x), dy: Math.round(box.y - wanted.box.y)},
    outside: edges.some((edge) => Math.abs(edge) > TOLERANCES.tileMargin),
  }
}

function sameElement(input: {a: Fingerprint; b: Fingerprint; path: string; wantedPath: string}): boolean {
  const {a, b} = input
  if (a.key !== null && b.key !== null) return a.key === b.key
  return unkeyedSame(input)
}

function unkeyedSame(input: {a: Fingerprint; b: Fingerprint; path: string; wantedPath: string}): boolean {
  const {a, b} = input
  if (a.textHash !== b.textHash) return false
  if (b.source === null) return a.source === null && a.tag === b.tag && input.path === input.wantedPath
  return a.source !== null && a.source.file === b.source.file && a.source.line === b.source.line
}

function flattened(components: LiveComponent[]): LiveComponent[] {
  return components.flatMap((component) => [component, ...flattened(component.children)])
}
