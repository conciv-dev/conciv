import type {ChatRequest} from '@aidx/protocol/chat-types'

// Pull the latest user-turn text from a validated chat request. Tolerant of both the
// parts-based UIMessage shape ({role, parts:[{type:'text', content}]}) and a plain
// {role, content: string} model message, since the transport may send either.
export function lastUserText(req: ChatRequest): string {
  const last = req.messages.filter((m) => m.role === 'user').at(-1)
  if (!last) return ''
  if (typeof last.content === 'string') return last.content
  if (!last.parts) return ''
  return last.parts
    .filter((p) => p.type === 'text')
    .map((p) => p.content ?? '')
    .join('\n')
}
