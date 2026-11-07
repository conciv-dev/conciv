import type {
  Ballot,
  Coverage,
  Design,
  IdNode,
  LiveComponent,
  Mapping,
  Match,
  Measured,
  Pairer,
  Raster,
} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'
import {readIds} from '../shared/id-tree.js'

export async function mappingOf(input: {
  design: Design
  measured: Measured
  built: {root: IdNode; changed: Set<string>}
  stored: Mapping
  round: number
  pairer: Pairer
  target: Raster
}): Promise<Mapped> {
  const {design, measured, built, stored, round} = input
  const sites = [...walk(built.root)].map(({node}) => node)
  const held = sites.flatMap((site) =>
    site.fom.map((entry) => ({
      site: site.id,
      entry,
      dom: site.dom.filter((dom) => entry.instance === null || dom.instance === entry.instance),
    })),
  )
  const pins = held.flatMap(({entry, dom}) => {
    const [only] = dom
    return only === undefined || dom.length > 1 ? [] : [{node: entry.nodeId, path: only.path, margin: entry.margin}]
  })
  const paired = await input.pairer({
    design,
    measured,
    target: input.target,
    ids: built.root,
    pins,
    budget: designConfig.tolerances.pairBudgetMs,
  })
  const pinned = new Map(pins.map((pin) => [pin.node, pin.path]))
  const heldOf = new Map(held.map((item) => [item.entry.nodeId, item]))
  const voted = [...walk(paired.root)].flatMap(({node: match}) => {
    const {live} = match
    if (live === null || live.key === null) return []
    const kept = pinned.get(match.node.id) === live.path ? heldOf.get(match.node.id)?.entry : undefined
    const fresh = {
      nodeId: match.node.id,
      instance: live.repeat,
      confidence: match.confidence,
      margin: match.margin ?? 0,
      round,
    }
    return [{id: live.key, entry: kept ?? fresh, kept: kept !== undefined}]
  })
  const mapping: Mapping = Object.fromEntries(
    Object.entries(Object.groupBy(voted, ({id}) => id)).map(([id, list]) => [
      id,
      {nodes: (list ?? []).map(({entry}) => entry)},
    ]),
  )
  const keptNodes = new Set(voted.flatMap(({entry, kept}) => (kept ? [entry.nodeId] : [])))
  const mappedNow = new Set(voted.map(({entry}) => entry.nodeId))
  const present = new Set(sites.map((site) => site.id))
  const lost = [
    ...held.filter(({dom}) => dom.length === 0).map(({entry}) => entry.nodeId),
    ...Object.entries(stored).flatMap(([id, {nodes}]) => (present.has(id) ? [] : nodes.map((entry) => entry.nodeId))),
  ]
  const dupes = held.filter(({dom}) => dom.length > 1)
  const revoted = new Map(
    [
      ...dupes.map(({site}) => [site, REASONS.dupe] as const),
      ...pins.flatMap((pin) =>
        keptNodes.has(pin.node) ? [] : [[heldOf.get(pin.node)?.site ?? '', REASONS.rival] as const],
      ),
      ...Object.keys(stored)
        .filter((id) => built.changed.has(id) && (stored[id]?.nodes.length ?? 0) > 0)
        .map((id) => [id, REASONS.evidence] as const),
    ].filter(([id]) => id !== ''),
  )
  const root = attached({node: built.root, mapping})
  const reads = readIds({root, live: measured.live})
  const elements = new Map([...walk(measured.live)].map(({node}) => [node.path, node]))
  return {
    mapping,
    root,
    dupes: dupes.map(({entry}) => entry.nodeId),
    candidates: candidatesOf({match: paired.root, mapped: mappedNow, elements, selector: reads.selector}),
    notRendered: lost.filter((node) => !mappedNow.has(node)),
    revoted: [...revoted.keys()],
    reasons: Object.fromEntries(revoted),
    votes: paired.votes,
    gone: Object.keys(stored).filter((id) => !present.has(id)),
  }
}

type Mapped = {
  mapping: Mapping
  root: IdNode
  dupes: string[]
  candidates: Coverage['candidates']
  notRendered: string[]
  revoted: string[]
  reasons: Record<string, string>
  votes: Ballot[]
  gone: string[]
}

const REASONS = {
  dupe: 'its id and list key match more than one element',
  rival: 'its element moved under a new parent or a rival outscored it by more than its margin',
  evidence: 'the evidence under its id changed: box, element or classes',
}

function attached(input: {node: IdNode; mapping: Mapping}): IdNode {
  const {node, mapping} = input
  return {
    ...node,
    fom: mapping[node.id]?.nodes ?? [],
    children: node.children.map((child) => attached({node: child, mapping})),
  }
}

function candidatesOf(input: {
  match: Match
  mapped: Set<string>
  elements: Map<string, LiveComponent>
  selector: ReturnType<typeof readIds>['selector']
}): Coverage['candidates'] {
  const {mapped, elements, selector} = input
  return [...walk(input.match)].flatMap(({node}) => {
    const listed = (node.candidates ?? []).flatMap((candidate) => {
      const element = elements.get(candidate.path)
      if (element === undefined || element.key === null) return []
      return [{selector: selector({id: element.key, instance: element.repeat}), score: candidate.score}]
    })
    return mapped.has(node.node.id) || node.live !== null || listed.length === 0
      ? []
      : [{node: node.node.id, candidates: listed}]
  })
}
