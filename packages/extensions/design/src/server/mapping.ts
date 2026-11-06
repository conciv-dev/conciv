import type {Design, Mapping, Measured, Pairer, Raster, TargetRecord} from '../shared/defs.js'
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
}): Promise<Mapping> {
  const {record, design, measured, round} = input
  const fileKey = record.ref.split('/')[0] ?? record.ref
  const entry = (given: {nodeId: string; conciv: string; source: Source}): Mapping[number] => ({
    figma: {fileKey, nodeId: given.nodeId},
    conciv: given.conciv,
    source: given.source,
    round,
  })
  const nodes = new Set([...walk(design.root)].map(({node}) => node.id))
  const elements = [...walk(measured.live)].flatMap(({node, depth}) => (depth === 0 ? [] : [node]))
  const declared = unique(
    elements.flatMap((element) =>
      element.figma === null || element.key === null || !nodes.has(element.figma)
        ? []
        : [entry({nodeId: element.figma, conciv: element.key, source: 'declared'})],
    ),
  )
  const named = new Set(declared.map((item) => item.figma.nodeId))
  const kept = [...declared, ...input.stored.filter((item) => !named.has(item.figma.nodeId))]
  const mapped = new Set(kept.map((item) => item.figma.nodeId))
  const unmapped = [...nodes].filter((node) => !mapped.has(node))
  if (unmapped.length === 0) return kept
  const paths = new Map(
    elements.flatMap((element) => (element.key === null ? [] : [[element.key, element.path] as const])),
  )
  const pins = kept.flatMap((item) => {
    const path = paths.get(item.conciv)
    return path === undefined ? [] : [{node: item.figma.nodeId, path}]
  })
  const paired = await input.pairer({
    design,
    measured,
    target: input.target,
    pins,
    budget: designConfig.tolerances.pairBudgetMs,
  })
  const open = new Set(unmapped)
  const voted = [...walk(paired.root)].flatMap(({node}) =>
    open.has(node.node.id) && node.live !== null && node.live.key !== null
      ? [entry({nodeId: node.node.id, conciv: node.live.key, source: 'voted'})]
      : [],
  )
  return [...kept, ...voted]
}

type Source = Mapping[number]['source']

function unique(entries: Mapping): Mapping {
  const seen = new Set<string>()
  return entries.filter((item) => {
    const id = `${item.figma.nodeId} ${item.conciv}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}
