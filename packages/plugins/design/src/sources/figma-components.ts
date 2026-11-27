import {z} from 'zod'
import type {DesignNode} from '../model/design.js'

export function linkComponents(input: {root: DesignNode; entry: unknown}): DesignNode {
  const entry = EntrySchema.safeParse(input.entry)
  if (!entry.success) return input.root
  const {document, components, componentSets} = entry.data
  const named = new Map(
    listNodes(document).flatMap((node) => {
      const main = findMain({node, components})
      if (main === null) return []
      const set = main.componentSetId === undefined ? undefined : componentSets[main.componentSetId]
      return [[node.id, variantDropped(set?.name ?? main.name)] satisfies [string, string]]
    }),
  )
  return linked({node: input.root, named})
}

const INSTANCE = 'INSTANCE'
const COMPONENT = 'COMPONENT'
const VARIANT_MARKS = ['/', '=']

const LinkNodeSchema = z.looseObject({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  componentId: z.string().optional().catch(undefined),
  get children() {
    return z.array(LinkNodeSchema).optional()
  },
})

const MainSchema = z.looseObject({name: z.string(), componentSetId: z.string().optional().catch(undefined)})

const EntrySchema = z.looseObject({
  document: LinkNodeSchema,
  components: z.record(z.string(), MainSchema).catch({}).default({}),
  componentSets: z
    .record(z.string(), z.looseObject({name: z.string()}))
    .catch({})
    .default({}),
})

type Main = z.output<typeof MainSchema>

type LinkNode = z.output<typeof LinkNodeSchema>

function listNodes(node: LinkNode): LinkNode[] {
  return [node, ...(node.children ?? []).flatMap(listNodes)]
}

function findMain(input: {node: LinkNode; components: Record<string, Main>}): Main | null {
  const {node, components} = input
  if (node.type === INSTANCE) return node.componentId === undefined ? null : (components[node.componentId] ?? null)
  if (node.type === COMPONENT) return components[node.id] ?? {name: node.name}
  return null
}

function variantDropped(name: string): string {
  const cut = VARIANT_MARKS.reduce((kept, mark) => kept.split(mark)[0] ?? kept, name)
  return cut.trim()
}

function linked(input: {node: DesignNode; named: Map<string, string>}): DesignNode {
  const {node, named} = input
  const children = node.children.map((child) => linked({node: child, named}))
  const component = named.get(node.id)
  if (component === undefined || node.figma === undefined) return {...node, children}
  return {...node, figma: {...node.figma, component}, children}
}
