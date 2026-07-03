import type {DirectiveFormatter, DirectiveSegment, TriggerItem} from './types.js'

const DIRECTIVE = /:([\w-]{1,64})\[([^\]\n]{1,1024})\](?:\{name=([^}\n]{1,1024})\})?/gu

export const defaultDirectiveFormatter: DirectiveFormatter = {
  serialize(item: TriggerItem): string {
    const attrs = item.id !== item.label ? `{name=${item.id}}` : ''
    return `:${item.type}[${item.label}]${attrs}`
  },
  parse(text: string): DirectiveSegment[] {
    const segments: DirectiveSegment[] = []
    let lastIndex = 0
    for (const match of text.matchAll(DIRECTIVE)) {
      if (match.index > lastIndex) segments.push({kind: 'text', text: text.slice(lastIndex, match.index)})
      const label = match[2] ?? ''
      segments.push({kind: 'mention', type: match[1] ?? '', label, id: match[3] ?? label})
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) segments.push({kind: 'text', text: text.slice(lastIndex)})
    return segments
  },
}
