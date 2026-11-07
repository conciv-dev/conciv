import type {Design, LiveComponent, Mapping, Measured, Pairer, Raster, TargetRecord} from '../shared/defs.js'
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
  if (unmapped.length === 0) return {mapping: stored, matches: measured.matches, dupes}
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
    return selector === null ? [] : [{nodeId: node.node.id, selector, path: node.live.path}]
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
        round,
      })),
    ],
    matches,
    dupes,
  }
}

type Mapped = {mapping: Mapping; matches: Map<string, string[]>; dupes: string[]}

type Tree = {
  parents: Map<string, LiveComponent | null>
  elements: Map<string, LiveComponent>
  siblings: Map<string, LiveComponent[]>
}

function treeOf(live: LiveComponent): Tree {
  const steps = [...walk(live)].filter(({depth}) => depth > 0)
  const parents = new Map(steps.map(({node, depth, parent}) => [node.path, depth > 1 ? parent : null]))
  const elements = new Map(steps.map(({node}) => [node.path, node]))
  const siblings = new Map<string, LiveComponent[]>()
  steps.forEach(({node}) => {
    const under = domParent(node.path)
    siblings.set(under, [...(siblings.get(under) ?? []), node])
  })
  return {parents, elements, siblings}
}

function selectorOf(input: {tree: Tree; path: string}): string | null {
  const element = input.tree.elements.get(input.path)
  if (element === undefined || element.key === null) return null
  const chain = chainOf({tree: input.tree, element})
  return chain.map((link) => partOf({tree: input.tree, element: link})).join(' ')
}

function chainOf(input: {tree: Tree; element: LiveComponent}): LiveComponent[] {
  const parent = input.tree.parents.get(input.element.path) ?? null
  const above = parent === null ? [] : chainOf({tree: input.tree, element: parent})
  return input.element.key === null ? above : [...above, input.element]
}

function partOf(input: {tree: Tree; element: LiveComponent}): string {
  const {element} = input
  const attribute = `[data-conciv-key="${element.key ?? ''}"]`
  const siblings = input.tree.siblings.get(domParent(element.path)) ?? []
  if (siblings.filter((sibling) => sibling.key === element.key).length < 2) return attribute
  const ofType = siblings.filter((sibling) => sibling.tag === element.tag && sibling.index <= element.index).length
  return `${attribute}:nth-of-type(${ofType})`
}

function domParent(path: string): string {
  return path.slice(0, path.lastIndexOf('/'))
}
