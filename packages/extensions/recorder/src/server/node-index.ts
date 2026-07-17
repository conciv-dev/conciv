import {z} from 'zod'

export type SerializedNode = {
  id: number
  type: number
  tagName?: string
  attributes?: Record<string, unknown>
  textContent?: string
  childNodes?: SerializedNode[]
}

const serializedNode: z.ZodType<SerializedNode> = z.lazy(() =>
  z.object({
    id: z.number(),
    type: z.number(),
    tagName: z.string().optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
    textContent: z.string().optional(),
    childNodes: z.array(serializedNode).optional(),
  }),
)

const mutationData = z.object({
  adds: z.array(z.object({node: serializedNode})).default([]),
  removes: z.array(z.object({id: z.number()})).default([]),
  attributes: z.array(z.object({id: z.number(), attributes: z.record(z.string(), z.unknown())})).default([]),
})

export type NodeIndex = {
  applyFullSnapshot(root: unknown): void
  applyMutation(data: unknown): void
  describe(id: number): string
}

function ownText(node: SerializedNode): string {
  const direct = node.textContent ?? ''
  const children = (node.childNodes ?? []).map(ownText).join(' ')
  return `${direct} ${children}`.replace(/\s+/g, ' ').trim()
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

export function createNodeIndex(): NodeIndex {
  const byId = new Map<number, SerializedNode>()

  const walk = (node: SerializedNode): void => {
    byId.set(node.id, node)
    for (const child of node.childNodes ?? []) walk(child)
  }

  return {
    applyFullSnapshot(root) {
      byId.clear()
      const parsed = serializedNode.safeParse(root)
      if (parsed.success) walk(parsed.data)
    },
    applyMutation(data) {
      const parsed = mutationData.safeParse(data)
      if (!parsed.success) return
      for (const add of parsed.data.adds) walk(add.node)
      for (const change of parsed.data.attributes) {
        const node = byId.get(change.id)
        if (node) node.attributes = {...node.attributes, ...change.attributes}
      }
      for (const removal of parsed.data.removes) byId.delete(removal.id)
    },
    describe(id) {
      const node = byId.get(id)
      if (!node) return `node ${id}`
      const name = label(node)
      return name ? `${selectorish(node)} "${name}"` : selectorish(node)
    },
  }
}
