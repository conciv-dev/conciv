import type {Coverage, Design, LiveComponent, Mapping, Measured, Pairer, Raster, TargetRecord} from '../shared/defs.js'
import {designConfig} from '../shared/tolerances.js'
import {walk} from '../shared/tree.js'

export async function mappingOf(input: {
  record: TargetRecord
  design: Design
  measured: Measured
  stored: Mapping
  round: number
  pairer: Pairer
  target: Raster
}): Promise<Mapped> {
  const {record, design, measured, round} = input
  const fileKey = record.ref.split('/')[0] ?? record.ref
  const matched = (selector: string): string[] => measured.matches.get(selector) ?? []
  const ambiguous = input.stored.filter((item) => matched(item.selector).length > 1)
  const stored = input.stored.filter((item) => matched(item.selector).length <= 1)
  const nodes = new Set([...walk(design.root)].map(({node}) => node.id))
  const mapped = new Set(stored.map((item) => item.figma.nodeId))
  const unmapped = [...nodes].filter((node) => !mapped.has(node))
  const dupes = ambiguous.map((item) => item.figma.nodeId)
  if (unmapped.length === 0) return {mapping: stored, matches: measured.matches, dupes, candidates: []}
  const pins = stored.flatMap((item) => {
    const [path] = matched(item.selector)
    return path === undefined ? [] : [{node: item.figma.nodeId, path}]
  })
  const paired = await input.pairer({
    design,
    measured,
    target: input.target,
    pins,
    budget: designConfig.tolerances.pairBudgetMs,
  })
  const tree = treeOf(measured.live)
  const open = new Set(unmapped)
  const voted = [...walk(paired.root)].flatMap(({node}) => {
    if (!open.has(node.node.id) || node.live === null) return []
    const selector = selectorOf({tree, path: node.live.path})
    if (selector === null) return []
    return [{nodeId: node.node.id, selector, path: node.live.path, confidence: node.confidence, margin: node.margin}]
  })
  const candidates = [...walk(paired.root)].flatMap(({node}) => {
    const listed = (node.candidates ?? []).flatMap((candidate) => {
      const selector = selectorOf({tree, path: candidate.path})
      return selector === null ? [] : [{selector, score: candidate.score}]
    })
    return open.has(node.node.id) && node.live === null && listed.length > 0
      ? [{node: node.node.id, candidates: listed}]
      : []
  })
  const matches = new Map(measured.matches)
  voted.forEach((vote) => matches.set(vote.selector, matches.get(vote.selector) ?? [vote.path]))
  return {
    mapping: [
      ...stored,
      ...voted.map((vote): Mapping[number] => ({
        figma: {fileKey, nodeId: vote.nodeId},
        selector: vote.selector,
        source: 'voted',
        confidence: vote.confidence,
        ...(vote.margin === undefined ? {} : {margin: vote.margin}),
        round,
      })),
    ],
    matches,
    dupes,
    candidates,
  }
}

type Mapped = {mapping: Mapping; matches: Map<string, string[]>; dupes: string[]; candidates: Coverage['candidates']}

type Tree = {
  parents: Map<string, LiveComponent | null>
  elements: Map<string, LiveComponent>
}

function treeOf(live: LiveComponent): Tree {
  const steps = [...walk(live)].filter(({depth}) => depth > 0)
  const parents = new Map(steps.map(({node, depth, parent}) => [node.path, depth > 1 ? parent : null]))
  const elements = new Map(steps.map(({node}) => [node.path, node]))
  return {parents, elements}
}

function selectorOf(input: {tree: Tree; path: string}): string | null {
  const element = input.tree.elements.get(input.path)
  if (element === undefined || element.key === null) return null
  const chain = chainOf({tree: input.tree, element})
  return chain.map(partOf).join(' ')
}

function chainOf(input: {tree: Tree; element: LiveComponent}): LiveComponent[] {
  const parent = input.tree.parents.get(input.element.path) ?? null
  const above = parent === null ? [] : chainOf({tree: input.tree, element: parent})
  return input.element.key === null ? above : [...above, input.element]
}

function partOf(element: LiveComponent): string {
  if (element.repeat !== null) return `[data-conciv-instance=${JSON.stringify(element.repeat)}]`
  return `[data-conciv-key=${JSON.stringify(element.key ?? '')}]`
}
