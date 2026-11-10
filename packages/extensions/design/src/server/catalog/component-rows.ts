import {dirname, relative, resolve} from 'node:path'
import {dropRightWhile, once} from 'es-toolkit'
import {ResolverFactory} from 'oxc-resolver'
import type {Catalog, CatalogConfig, Component, Hint, Hinter, Ranked} from '../../shared/catalog-defs.js'
import type {ComponentRows, DesignNode, GateRow} from '../../shared/defs.js'
import {walk} from '../../shared/tree.js'
import {viteEntries} from './entries.js'
import {importLine} from './import-line.js'
import {sameFile} from './source-file.js'

export function createComponentRows(input: {
  catalog: Catalog
  hinters: Hinter[]
  config: CatalogConfig
  cwd: string
}): ComponentRows {
  const {catalog, hinters, config, cwd} = input
  const resolvers = once(async () => (await viteEntries({cwd})).map((root) => new ResolverFactory(root.resolve)))
  return {
    rows: async ({design, reads, relation}) => {
      if (!config.hint) return []
      const ranked = await catalog.list({})
      if (!ranked.some((component) => component.tier === KIT)) return []
      const walked = await catalog.list({hidden: true})
      const hints = new Map(hinters.flatMap((hinter) => [...hinter.hint({design, ranked, config})]))
      const found = await Promise.all(
        [...walk(design.root)].map(async ({node}) => {
          const hint = hints.get(node.id)
          if (hint === undefined || !reads.mapped(node.id)) return []
          const component = hinted({ranked, hint})
          if (component === undefined || !fires({component, hint})) return []
          if (rendered({related: relation.get(node.id), component})) return []
          const specifier = await usableFrom({
            component,
            file: sourceFile({reads, node: node.id}),
            walked,
            cwd,
            resolvers: await resolvers(),
          })
          if (specifier === null) return []
          return [rowOf({node, component, specifier, named: reads.named(node.id)})]
        }),
      )
      return found.flat()
    },
  }
}

type Reads = Parameters<ComponentRows['rows']>[0]['reads']

const KIT = 'kit'

const PREFER = 'prefer'

const CERTAIN = 1

const COMPONENT = 'component'

const SOURCE_SEPARATOR = ':'

const RELATIVE = '.'

function hinted(input: {ranked: Ranked[]; hint: Hint}): Ranked | undefined {
  const {ranked, hint} = input
  return ranked.find((component) => component.specifier === hint.specifier && component.names.includes(hint.component))
}

function fires(input: {component: Ranked; hint: Hint}): boolean {
  return input.component.flag === PREFER || input.hint.confidence >= CERTAIN
}

function rendered(input: {related: Component | undefined; component: Component}): boolean {
  const {related, component} = input
  if (related === undefined) return false
  if (related.id === component.id) return true
  return component.sites.some(
    (site) => site.file === related.file && related.lines.start <= site.line && site.line <= related.lines.end,
  )
}

function sourceFile(input: {reads: Reads; node: string}): string | null {
  const named = input.reads.named(input.node)
  if (named.source !== null) return fileOf(named.source)
  return named.id === null ? null : sourcedAbove({reads: input.reads, id: named.id})
}

function sourcedAbove(input: {reads: Reads; id: string}): string | null {
  const src = input.reads.getSRC(input.id)
  if (src === null) return null
  if (src.at !== null) return src.at.file
  return src.parent === null ? null : sourcedAbove({reads: input.reads, id: src.parent})
}

function fileOf(source: string): string {
  return dropRightWhile(source.split(SOURCE_SEPARATOR), (part) => part !== '' && Number.isInteger(Number(part))).join(
    SOURCE_SEPARATOR,
  )
}

async function usableFrom(input: {
  component: Component
  file: string | null
  walked: Ranked[]
  cwd: string
  resolvers: ResolverFactory[]
}): Promise<string | null> {
  const {component, file, walked, cwd, resolvers} = input
  if (file === null || component.framework === null) return null
  const host = walked.find((candidate) => sameFile({walked: candidate.file, source: file}))
  if (host === undefined || host.framework !== component.framework) return null
  const from = dirname(resolve(cwd, host.file))
  if (component.specifier.startsWith(RELATIVE)) return relativeTo({from, to: resolve(cwd, component.file)})
  const results = await Promise.all(resolvers.map((resolver) => resolver.async(from, component.specifier)))
  return results.some((result) => result.path !== undefined) ? component.specifier : null
}

function relativeTo(input: {from: string; to: string}): string {
  const path = relative(input.from, input.to)
  return path.startsWith(RELATIVE) ? path : `./${path}`
}

function rowOf(input: {
  node: DesignNode
  component: Component
  specifier: string
  named: Pick<GateRow, 'id' | 'selector' | 'source' | 'confidence' | 'margin'>
}): GateRow {
  const {node, component, specifier, named} = input
  const name = node.figma?.name ?? node.id
  const own = component.names[0] ?? component.specifier
  return {
    node: node.id,
    ...named,
    kind: COMPONENT,
    name,
    text: `${name} is drawn by hand; the design names \`${own}\` (\`${importLine({...component, specifier})}\`)`,
    magnitude: COMPONENT,
    component: own,
    specifier,
  }
}
