import type {ModelMessage} from '@conciv/ai/messages'
import type {HarnessImage} from '@conciv/protocol/harness-types'

export function lastUserModelText(messages: ModelMessage[]): string {
  const last = messages.findLast((m) => m.role === 'user')
  if (!last || last.content === null) return ''
  if (typeof last.content === 'string') return last.content
  return last.content.flatMap((p) => (p.type === 'text' ? [p.content] : [])).join('\n')
}

export function lastUserImages(messages: ModelMessage[]): HarnessImage[] {
  const last = messages.findLast((m) => m.role === 'user')
  if (!last || last.content === null || typeof last.content === 'string') return []
  return last.content.flatMap((p) => {
    if (p.type !== 'image' || p.source.type !== 'data') return []
    return [{mediaType: p.source.mimeType, dataBase64: p.source.value}]
  })
}
