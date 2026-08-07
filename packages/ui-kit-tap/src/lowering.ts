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
    .map(
      (line): LoweringNode => (line ? {type: 'paragraph', content: [{type: 'text', text: line}]} : {type: 'paragraph'}),
    )
  return {type: 'doc', content: blocks}
}

export function projectDocument(doc: LoweringNode): string {
  return (doc.content ?? []).map((block) => (block.content ?? []).map(inlineText).join('')).join('\n')
}

type MappingScan = {stringIndex: number; position: number}

function nodeSize(node: LoweringNode, lowered: number): number {
  return node.type === 'text' ? lowered : 1
}

function offsetWithinNode(node: LoweringNode, clamped: number, scan: MappingScan): number {
  if (node.type === 'text') return scan.position + (clamped - scan.stringIndex)
  return clamped === scan.stringIndex ? scan.position : scan.position + 1
}

function offsetWithinBlock(block: LoweringNode, clamped: number, scan: MappingScan): number | undefined {
  for (const node of block.content ?? []) {
    const lowered = inlineText(node).length
    if (clamped <= scan.stringIndex + lowered) return offsetWithinNode(node, clamped, scan)
    scan.stringIndex += lowered
    scan.position += nodeSize(node, lowered)
  }
  return undefined
}

export function offsetToPosition(doc: LoweringNode, offset: number): number {
  const clamped = Math.max(0, Math.min(offset, projectDocument(doc).length))
  const scan: MappingScan = {stringIndex: 0, position: 0}
  for (const block of doc.content ?? []) {
    scan.position += 1
    const within = offsetWithinBlock(block, clamped, scan)
    if (within !== undefined) return within
    if (clamped === scan.stringIndex) return scan.position
    scan.stringIndex += 1
    scan.position += 1
  }
  return scan.position
}

function positionWithinNode(node: LoweringNode, position: number, lowered: number, scan: MappingScan): number {
  if (node.type === 'text') return scan.stringIndex + Math.max(0, position - scan.position)
  return position <= scan.position ? scan.stringIndex : scan.stringIndex + lowered
}

function positionWithinBlock(block: LoweringNode, position: number, scan: MappingScan): number | undefined {
  for (const node of block.content ?? []) {
    const lowered = inlineText(node).length
    const size = nodeSize(node, lowered)
    const insideTextEnd = node.type === 'text' && position === scan.position + size
    if (position < scan.position + size || insideTextEnd) return positionWithinNode(node, position, lowered, scan)
    scan.position += size
    scan.stringIndex += lowered
  }
  return undefined
}

export function positionToOffset(doc: LoweringNode, position: number): number {
  const blocks = doc.content ?? []
  const scan: MappingScan = {stringIndex: 0, position: 0}
  for (const [blockIndex, block] of blocks.entries()) {
    if (position <= scan.position) return scan.stringIndex
    scan.position += 1
    const within = positionWithinBlock(block, position, scan)
    if (within !== undefined) return within
    if (position <= scan.position + 1 || blockIndex === blocks.length - 1) return scan.stringIndex
    scan.position += 1
    scan.stringIndex += 1
  }
  return scan.stringIndex
}
