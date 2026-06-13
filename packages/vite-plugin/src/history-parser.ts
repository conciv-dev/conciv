import type {MessagePart, UIMessage} from '@devgent/protocol/chat-types'

// Internal turns we hide from the human-readable chat history: the injected progress ticks,
// NEEDS_INFO sentinels, and system-reminder wrappers that the agent's iterate loop adds.
const INTERNAL_MARKERS = ['VIBE_PROGRESS_TICK', 'NEEDS_INFO:', '<system-reminder>']

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function partsFrom(content: unknown): MessagePart[] {
  if (!Array.isArray(content)) return []
  const out: MessagePart[] = []
  for (const part of content) {
    if (!isRecord(part)) continue
    if (part.type === 'text' && typeof part.text === 'string') out.push({type: 'text', content: part.text})
    if (part.type === 'thinking' && typeof part.thinking === 'string')
      out.push({type: 'thinking', content: part.thinking})
    if (part.type === 'tool_use' && typeof part.id === 'string' && typeof part.name === 'string') {
      out.push({
        type: 'tool-call',
        id: part.id,
        name: part.name,
        arguments: JSON.stringify(part.input ?? {}),
        state: 'input-complete',
      })
    }
  }
  return out
}

function isInternal(parts: MessagePart[]): boolean {
  const text = parts
    .filter((p) => p.type === 'text')
    .map((p) => ('content' in p ? p.content : ''))
    .join('\n')
  return INTERNAL_MARKERS.some((m) => text.includes(m))
}

// Parse a Claude session JSONL transcript into filtered, human-readable UIMessages. Drops
// system/meta records and internal iterate/progress prompts. Skips bad lines (tolerant of
// transcript-format drift).
export function parseHistory(jsonl: string): UIMessage[] {
  const out: UIMessage[] = []
  const idState = {n: 0}
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const e = ((): unknown => {
      try {
        return JSON.parse(trimmed) as unknown
      } catch {
        return null
      }
    })()
    if (!isRecord(e)) continue
    if (e.type !== 'user' && e.type !== 'assistant') continue
    if (!isRecord(e.message)) continue
    const parts = partsFrom((e.message as {content?: unknown}).content)
    if (parts.length === 0 || isInternal(parts)) continue
    idState.n += 1
    out.push({id: `h${idState.n}`, role: e.type, parts})
  }
  return out
}
