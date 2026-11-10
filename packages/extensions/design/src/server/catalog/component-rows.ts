import type {Catalog, CatalogConfig, Component, Hint, Hinter, Ranked} from '../../shared/catalog-defs.js'
import type {ComponentRows, DesignNode, GateRow} from '../../shared/defs.js'
import {walk} from '../../shared/tree.js'
import {importLine} from './import-line.js'

export function createComponentRows(input: {
  catalog: Catalog
  hinters: Hinter[]
  config: CatalogConfig
}): ComponentRows {
  const {catalog, hinters, config} = input
  return {
    rows: async ({design, reads, relation}) => {
      if (!config.hint) return []
      const ranked = await catalog.list({})
      if (!ranked.some((component) => component.tier === KIT)) return []
      const hints = new Map(hinters.flatMap((hinter) => [...hinter.hint({design, ranked, config})]))
      return [...walk(design.root)].flatMap(({node}) => {
        const hint = hints.get(node.id)
        if (hint === undefined || !reads.mapped(node.id)) return []
        const component = hinted({ranked, hint})
        if (component === undefined || !fires({component, hint})) return []
        if (relation.get(node.id)?.id === component.id) return []
        return [rowOf({node, component, named: reads.named(node.id)})]
      })
    },
  }
}

const KIT = 'kit'

const PREFER = 'prefer'

const CERTAIN = 1

const COMPONENT = 'component'

function hinted(input: {ranked: Ranked[]; hint: Hint}): Ranked | undefined {
  const {ranked, hint} = input
  return ranked.find((component) => component.specifier === hint.specifier && component.names.includes(hint.component))
}

function fires(input: {component: Ranked; hint: Hint}): boolean {
  return input.component.flag === PREFER || input.hint.confidence >= CERTAIN
}

function rowOf(input: {
  node: DesignNode
  component: Component
  named: Pick<GateRow, 'id' | 'selector' | 'source' | 'confidence' | 'margin'>
}): GateRow {
  const {node, component, named} = input
  const name = node.figma?.name ?? node.id
  const own = component.names[0] ?? component.specifier
  return {
    node: node.id,
    ...named,
    kind: COMPONENT,
    name,
    text: `${name} is drawn by hand; the design names \`${own}\` (\`${importLine(component)}\`)`,
    magnitude: COMPONENT,
    component: own,
    specifier: component.specifier,
  }
}
