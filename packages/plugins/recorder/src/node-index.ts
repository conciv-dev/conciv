import {z} from 'zod'

export type SerializedNode = {
  readonly id: number
  readonly type: number
  readonly tagName?: string
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly textContent?: string
  readonly isSVG?: boolean
  readonly needBlock?: boolean
  readonly compatMode?: string
  readonly name?: string
  readonly publicId?: string
  readonly systemId?: string
  readonly childNodes?: readonly SerializedNode[]
}

const serializedNode: z.ZodType<SerializedNode> = z.lazy(() =>
  z.object({
    id: z.number(),
    type: z.number(),
    tagName: z.string().optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
    textContent: z.string().optional(),
    isSVG: z.boolean().optional(),
    needBlock: z.boolean().optional(),
    compatMode: z.string().optional(),
    name: z.string().optional(),
    publicId: z.string().optional(),
    systemId: z.string().optional(),
    childNodes: z.array(serializedNode).optional(),
  }),
)

const mutationData = z.object({
  adds: z.array(z.object({parentId: z.number().optional(), node: serializedNode})).default([]),
  removes: z.array(z.object({id: z.number()})).default([]),
  attributes: z.array(z.object({id: z.number(), attributes: z.record(z.string(), z.unknown())})).default([]),
  texts: z.array(z.object({id: z.number(), value: z.string().nullable()})).default([]),
})

export type NodeIndex = readonly SerializedNode[]

export const emptyNodeIndex: NodeIndex = []

function ownText(node: SerializedNode): string {
  const direct = node.textContent ?? ''
  const children = (node.childNodes ?? []).map(ownText).join(' ')
  return `${direct} ${children}`.replace(/\s+/g, ' ').trim()
}

const metaFieldsByType: Record<number, ReadonlyArray<keyof SerializedNode>> = {
  0: ['compatMode'],
  1: ['name', 'publicId', 'systemId'],
  2: ['tagName', 'attributes', 'isSVG', 'needBlock'],
  3: ['textContent'],
  4: ['textContent'],
  5: ['textContent'],
}

function sameMeta(existing: SerializedNode, added: SerializedNode): boolean {
  const fields = metaFieldsByType[existing.type]
  if (!fields || existing.type !== added.type) return false
  return fields.every((field) => JSON.stringify(existing[field]) === JSON.stringify(added[field]))
}

function label(node: SerializedNode): string {
  const attributes = node.attributes ?? {}
  const aria = attributes['aria-label']
  if (typeof aria === 'string' && aria) return aria
  const text = ownText(node)
  if (text) return text.slice(0, 60)
  const placeholder = attributes['placeholder']
  if (typeof placeholder === 'string' && placeholder) return placeholder
  return ''
}

function selectorish(node: SerializedNode): string {
  const attributes = node.attributes ?? {}
  const id = attributes['id']
  const idPart = typeof id === 'string' && id ? `#${id}` : ''
  return `${node.tagName ?? 'node'}${idPart}`
}

function findNode(nodes: NodeIndex, id: number): SerializedNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.childNodes ?? [], id)
    if (found) return found
  }
  return undefined
}

function withoutNode(nodes: NodeIndex, id: number): NodeIndex {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => (node.childNodes ? {...node, childNodes: withoutNode(node.childNodes, id)} : node))
}

function updateNode(nodes: NodeIndex, id: number, change: (node: SerializedNode) => SerializedNode): NodeIndex {
  return nodes.map((node) => {
    if (node.id === id) return change(node)
    return node.childNodes ? {...node, childNodes: updateNode(node.childNodes, id, change)} : node
  })
}

function appendChild(nodes: NodeIndex, parentId: number, child: SerializedNode): NodeIndex {
  return updateNode(nodes, parentId, (parent) => ({...parent, childNodes: [...(parent.childNodes ?? []), child]}))
}

type Mutation = z.infer<typeof mutationData>

function applyAdd(index: NodeIndex, add: Mutation['adds'][number]): NodeIndex {
  const parent = add.parentId === undefined ? undefined : findNode(index, add.parentId)
  const existing = findNode(index, add.node.id)
  if (parent && existing && sameMeta(existing, add.node) && !findNode([existing], parent.id))
    return appendChild(withoutNode(index, existing.id), parent.id, existing)
  const cleared = existing ? withoutNode(index, existing.id) : index
  if (!parent) return [...cleared, add.node]
  return appendChild(cleared, parent.id, add.node)
}

export function applyFullSnapshot(root: unknown): NodeIndex {
  const parsed = serializedNode.safeParse(root)
  return parsed.success ? [parsed.data] : emptyNodeIndex
}

export function applyMutation(index: NodeIndex, data: unknown): NodeIndex {
  const parsed = mutationData.safeParse(data)
  if (!parsed.success) return index
  const removed = parsed.data.removes.reduce((nodes, removal) => withoutNode(nodes, removal.id), index)
  const added = parsed.data.adds.reduce(applyAdd, removed)
  const attributed = parsed.data.attributes.reduce(
    (nodes, change) =>
      updateNode(nodes, change.id, (node) => ({...node, attributes: {...node.attributes, ...change.attributes}})),
    added,
  )
  return parsed.data.texts.reduce(
    (nodes, change) => updateNode(nodes, change.id, (node) => ({...node, textContent: change.value ?? ''})),
    attributed,
  )
}

export function describeNode(index: NodeIndex, id: number): string {
  const node = findNode(index, id)
  if (!node) return `node ${id}`
  const name = label(node)
  return name ? `${selectorish(node)} "${name}"` : selectorish(node)
}
