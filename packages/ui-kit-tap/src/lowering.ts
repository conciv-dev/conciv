export type LoweringNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: LoweringNode[]
}

export function chipText(node: LoweringNode): string {
  return `${String(node.attrs?.mentionSuggestionChar ?? '@')}${String(node.attrs?.id ?? '')}`
}

function inlineText(node: LoweringNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'mention') return chipText(node)
  return ''
}

export function buildDocument(text: string): LoweringNode {
  const blocks = text
    .split('\n')
    .map((line): LoweringNode => (line ? {type: 'paragraph', content: [{type: 'text', text: line}]} : {type: 'paragraph'}))
  return {type: 'doc', content: blocks}
}

export function projectDocument(doc: LoweringNode): string {
  return (doc.content ?? []).map((block) => (block.content ?? []).map(inlineText).join('')).join('\n')
}

export function offsetToPosition(doc: LoweringNode, offset: number): number {
  const blocks = doc.content ?? []
  const clamped = Math.max(0, Math.min(offset, projectDocument(doc).length))
  let stringIndex = 0
  let position = 0
  for (const block of blocks) {
    position += 1
    for (const node of block.content ?? []) {
      const lowered = inlineText(node).length
      const size = node.type === 'text' ? lowered : 1
      if (clamped <= stringIndex + lowered) {
        if (node.type === 'text') return position + (clamped - stringIndex)
        return clamped === stringIndex ? position : position + 1
      }
      stringIndex += lowered
      position += size
    }
    if (clamped === stringIndex) return position
    stringIndex += 1
    position += 1
  }
  return position
}

export function positionToOffset(doc: LoweringNode, position: number): number {
  const blocks = doc.content ?? []
  let stringIndex = 0
  let current = 0
  for (const [blockIndex, block] of blocks.entries()) {
    if (position <= current) return stringIndex
    current += 1
    for (const node of block.content ?? []) {
      const lowered = inlineText(node).length
      const size = node.type === 'text' ? lowered : 1
      if (position < current + size || (node.type === 'text' && position === current + size)) {
        if (node.type === 'text') return stringIndex + Math.max(0, position - current)
        return position <= current ? stringIndex : stringIndex + lowered
      }
      current += size
      stringIndex += lowered
    }
    if (position <= current + 1 || blockIndex === blocks.length - 1) return stringIndex
    current += 1
    stringIndex += 1
  }
  return stringIndex
}
