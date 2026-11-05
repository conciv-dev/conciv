import {uniqBy} from 'es-toolkit'
import type {DesignNode, DiffReport, Match, Placement, Run, Store, Twins} from '../shared/defs.js'
import {readingOrder} from '../shared/box.js'
import {walk} from '../shared/tree.js'

export function createTwins(input: {store: Store}): Twins {
  const {store} = input
  return {
    link: async ({id, session}) => {
      const others = (await store.list()).filter((record) => record.session === session && record.id !== id)
      const here = await latestRun({store, id})
      if (here === null) return
      await Promise.all(others.map((other) => linkPair({store, here, other: other.id})))
    },
    placements: async (id) => {
      const twins = (await store.decisions(id)).filter((decision) => decision.kind === 'twin')
      const placed = await Promise.all(
        twins.map(async (decision): Promise<Placement[]> => {
          const [target = '', node = ''] = String(decision.value).split(TWIN_SEPARATOR)
          const run = await latestRun({store, id: target})
          const found = run === null ? null : paired(run.root).get(node)
          if (found === undefined || found === null || found.live === null) return []
          return [{node: decision.anchor, target, path: found.live.path, confidence: found.confidence}]
        }),
      )
      return uniqBy(
        placed.flat().toSorted((a, b) => b.confidence - a.confidence),
        (placement) => `${placement.node}:${placement.target}`,
      )
    },
    responsive: async ({id, design}) => {
      const twins = (await store.decisions(id)).filter((decision) => decision.kind === 'twin')
      const byTarget = Map.groupBy(twins, (decision) => String(decision.value).split(TWIN_SEPARATOR)[0] ?? '')
      const sections = await Promise.all(
        [...byTarget].map(async ([target, decisions]) => {
          const record = await store.record(target)
          const there = await store.design(target).catch(() => null)
          if (record === null || there === null) return []
          const twinned = new Map(
            decisions.map((decision) => [decision.anchor, String(decision.value).split(TWIN_SEPARATOR)[1] ?? '']),
          )
          return [
            compareSlices({
              here: design,
              hereWidth: design.viewport.width,
              there: there.root,
              thereWidth: there.viewport.width / there.scale,
              scale: there.scale,
              twinned,
              width: record.width,
              target,
            }),
          ]
        }),
      )
      return sections.flat()
    },
  }
}

const TWIN_SEPARATOR = ':'

const STRETCHED = 0.85

async function linkPair(input: {store: Store; here: Run; other: string}): Promise<void> {
  const {store, here, other} = input
  const there = await latestRun({store, id: other})
  if (there === null) return
  const byPath = new Map(
    [...paired(there.root).values()].flatMap((match) =>
      match.live === null ? [] : [[match.live.path, match] as const],
    ),
  )
  const links = [...paired(here.root).values()].flatMap((match) => {
    const twin = match.live === null ? undefined : byPath.get(match.live.path)
    return twin === undefined ? [] : [{node: match.node.id, twin: twin.node.id}]
  })
  await unlink({store, id: here.design, other})
  await unlink({store, id: other, other: here.design})
  for (const link of links) {
    await store.decide({
      id: here.design,
      kind: 'twin',
      anchor: link.node,
      value: `${other}${TWIN_SEPARATOR}${link.twin}`,
    })
    await store.decide({
      id: other,
      kind: 'twin',
      anchor: link.twin,
      value: `${here.design}${TWIN_SEPARATOR}${link.node}`,
    })
  }
}

async function unlink(input: {store: Store; id: string; other: string}): Promise<void> {
  const {store, id, other} = input
  const stale = (await store.decisions(id)).filter(
    (decision) => decision.kind === 'twin' && String(decision.value).startsWith(`${other}${TWIN_SEPARATOR}`),
  )
  for (const decision of stale) await store.revoke({id, decision: decision.id})
}

async function latestRun(input: {store: Store; id: string}): Promise<Run | null> {
  const last = (await input.store.runs(input.id)).at(-1)
  return last === undefined ? null : input.store.run({id: input.id, run: last})
}

function paired(root: Match): Map<string, Match> {
  return new Map([...walk({root})].flatMap(({node, depth}) => (depth === 0 ? [] : [[node.node.id, node] as const])))
}

function compareSlices(input: {
  here: Design
  hereWidth: number
  there: DesignNode
  thereWidth: number
  scale: number
  twinned: Map<string, string>
  width: number
  target: string
}): DiffReport['responsive'][number] {
  const {here, there, twinned, width, target} = input
  const hereNodes = nodesOf(here.root)
  const thereNodes = new Map(nodesOf(there).map((node) => [node.id, node]))
  const twinIds = new Set(twinned.values())
  const hereRanks = ranks(hereNodes.filter((node) => twinned.has(node.id)))
  const thereRanks = ranks([...thereNodes.values()].filter((node) => twinIds.has(node.id)))
  const linked = hereNodes.flatMap((node) => {
    const twin = thereNodes.get(twinned.get(node.id) ?? '')
    return twin === undefined ? [] : [{node, twin}]
  })
  return {
    target,
    width,
    twins: linked.length,
    absent: hereNodes.filter((node) => node.kind !== 'image' && !twinned.has(node.id)).map(nodeLabel),
    reordered: linked
      .filter(({node, twin}) => hereRanks.get(node.id) !== thereRanks.get(twin.id))
      .map(({node}) => nodeLabel(node)),
    stretched: linked
      .filter(
        ({node, twin}) =>
          spans({box: node.box, width: input.hereWidth}) !==
          spans({box: {...twin.box, w: twin.box.w / input.scale}, width: input.thereWidth}),
      )
      .map(({node}) => nodeLabel(node)),
  }
}

type Design = Parameters<Twins['responsive']>[0]['design']

function nodesOf(root: DesignNode): DesignNode[] {
  return [...walk({root})].flatMap(({node, depth}) => (depth === 0 ? [] : [node]))
}

function ranks(nodes: DesignNode[]): Map<string, number> {
  return new Map(nodes.toSorted((a, b) => readingOrder(a.box, b.box)).map((node, index) => [node.id, index]))
}

function spans(input: {box: DesignNode['box']; width: number}): boolean {
  return input.box.w >= STRETCHED * input.width
}

function nodeLabel(node: DesignNode): string {
  if (node.kind === 'text') return node.text
  return `${node.kind} ${Math.round(node.box.w)}×${Math.round(node.box.h)} at ${Math.round(node.box.x)},${Math.round(node.box.y)}`
}
