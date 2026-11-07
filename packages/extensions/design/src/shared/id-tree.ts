import type {GateRow, IdNode, LiveComponent} from './defs.js'
import {walk} from './tree.js'

export function readIds(input: {root: IdNode; live: LiveComponent | null}): IdReads {
  const sites = new Map([...walk(input.root)].map(({node}) => [node.id, node]))
  const elements = new Map(input.live === null ? [] : [...walk(input.live)].map(({node}) => [node.path, node]))
  const holders = new Map(
    [...sites.values()].flatMap((site) => site.fom.map((entry) => [entry.nodeId, {site, entry}] as const)),
  )
  const domOf = (node: string): IdNode['dom'] => {
    const holder = holders.get(node)
    if (holder === undefined) return []
    const {instance} = holder.entry
    return holder.site.dom.filter((dom) => instance === null || dom.instance === instance)
  }
  const nodesAt = new Map(
    [...holders.keys()].flatMap((node) => domOf(node).map((dom) => [dom.path, node] as const)).toReversed(),
  )
  const of = (node: string): LiveComponent[] => domOf(node).flatMap((dom) => elements.get(dom.path) ?? [])
  return {
    getDOM: (id) => sites.get(id)?.dom ?? [],
    getCSSOM: (id) => sites.get(id)?.cssom ?? [],
    getSRC: (id) => sites.get(id)?.src ?? null,
    getFOM: (id) => sites.get(id)?.fom ?? [],
    sites: () => [...sites.values()],
    of,
    nodeOf: (element) => nodesAt.get(element.path) ?? null,
    mapped: (node) => holders.has(node),
    named: (node) => {
      const holder = holders.get(node)
      const source = of(node)[0]?.source ?? null
      if (holder === undefined) return {id: null, selector: null, source: null, confidence: null, margin: null}
      const {site, entry} = holder
      return {
        id: site.id,
        selector: selectorOf({id: site.id, instance: entry.instance}),
        source: source === null ? null : `${source.file}:${source.line}:${source.column}`,
        confidence: entry.confidence,
        margin: entry.margin,
      }
    },
    selector: selectorOf,
  }
}

type IdReads = {
  getDOM: (id: string) => IdNode['dom']
  getCSSOM: (id: string) => IdNode['cssom']
  getSRC: (id: string) => IdNode['src'] | null
  getFOM: (id: string) => IdNode['fom']
  sites: () => IdNode[]
  of: (node: string) => LiveComponent[]
  nodeOf: (element: LiveComponent) => string | null
  mapped: (node: string) => boolean
  named: (node: string) => Pick<GateRow, 'id' | 'selector' | 'source' | 'confidence' | 'margin'>
  selector: (input: {id: string; instance: string | null}) => string
}

function selectorOf(input: {id: string; instance: string | null}): string {
  if (input.instance !== null) return `[data-conciv-instance=${JSON.stringify(input.instance)}]`
  return `[data-conciv-key=${JSON.stringify(input.id)}]`
}
