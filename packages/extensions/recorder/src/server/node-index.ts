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
  adds: z.array(z.object({parentId: z.number().optional(), node: serializedNode})).default([]),
  removes: z.array(z.object({id: z.number()})).default([]),
  attributes: z.array(z.object({id: z.number(), attributes: z.record(z.string(), z.unknown())})).default([]),
  texts: z.array(z.object({id: z.number(), value: z.string().nullable()})).default([]),
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
  const parentOf = new Map<number, number>()

  const walk = (node: SerializedNode, parentId?: number): void => {
    byId.set(node.id, node)
    if (parentId !== undefined) parentOf.set(node.id, parentId)
    for (const child of node.childNodes ?? []) walk(child, node.id)
  }

  const forget = (node: SerializedNode): void => {
    for (const child of node.childNodes ?? []) forget(child)
    parentOf.delete(node.id)
    byId.delete(node.id)
  }

  const detach = (id: number): void => {
    const parentId = parentOf.get(id)
    const parent = parentId === undefined ? undefined : byId.get(parentId)
    if (parent) parent.childNodes = (parent.childNodes ?? []).filter((child) => child.id !== id)
  }

  type Mutation = z.infer<typeof mutationData>

  const applyAdds = (adds: Mutation['adds']): void => {
    for (const add of adds) {
      walk(add.node, add.parentId)
      const parent = add.parentId === undefined ? undefined : byId.get(add.parentId)
      if (parent) parent.childNodes = [...(parent.childNodes ?? []), add.node]
    }
  }

  const applyAttributes = (changes: Mutation['attributes']): void => {
    for (const change of changes) {
      const node = byId.get(change.id)
      if (node) node.attributes = {...node.attributes, ...change.attributes}
    }
  }

  const applyTexts = (changes: Mutation['texts']): void => {
    for (const change of changes) {
      const node = byId.get(change.id)
      if (node) node.textContent = change.value ?? ''
    }
  }

  const applyRemoves = (removes: Mutation['removes']): void => {
    for (const removal of removes) {
      const node = byId.get(removal.id)
      detach(removal.id)
      if (node) forget(node)
      if (!node) parentOf.delete(removal.id)
    }
  }

  return {
    applyFullSnapshot(root) {
      byId.clear()
      parentOf.clear()
      const parsed = serializedNode.safeParse(root)
      if (parsed.success) walk(parsed.data)
    },
    applyMutation(data) {
      const parsed = mutationData.safeParse(data)
      if (!parsed.success) return
      applyRemoves(parsed.data.removes)
      applyAdds(parsed.data.adds)
      applyAttributes(parsed.data.attributes)
      applyTexts(parsed.data.texts)
    },
    describe(id) {
      const node = byId.get(id)
      if (!node) return `node ${id}`
      const name = label(node)
      return name ? `${selectorish(node)} "${name}"` : selectorish(node)
    },
  }
}
