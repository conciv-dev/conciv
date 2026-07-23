import type {UIMessage} from '@tanstack/ai'
import type {ChatHistory} from '@conciv/protocol/chat-types'

const MCP_PREFIX = /^mcp__.+?__/
const OPENCODE_BRIDGE_PREFIX = /^tanstack_/

const sanitize = (name: string): string => name.replace(/[^A-Za-z0-9_-]/g, '_')

function strippedCandidates(name: string): string[] {
  if (MCP_PREFIX.test(name)) return [name.replace(MCP_PREFIX, '')]
  if (OPENCODE_BRIDGE_PREFIX.test(name)) return [name.replace(OPENCODE_BRIDGE_PREFIX, '')]
  return [name]
}

export function makeToolNameNormalizer(registered: ReadonlySet<string>): (name: string) => string {
  const bySanitized = new Map<string, string | null>()
  for (const name of registered) {
    const key = sanitize(name)
    bySanitized.set(key, bySanitized.has(key) ? null : name)
  }
  return (name) => {
    if (registered.has(name)) return name
    for (const candidate of strippedCandidates(name)) {
      if (registered.has(candidate)) return candidate
      const mapped = bySanitized.get(candidate)
      if (mapped != null) return mapped
    }
    return name
  }
}

function normalizeMessage(message: UIMessage, normalize: (name: string) => string): UIMessage {
  if (!Array.isArray(message.parts)) return message
  if (!message.parts.some((part) => part.type === 'tool-call' && part.name !== normalize(part.name))) return message
  return {
    ...message,
    parts: message.parts.map((part) => (part.type === 'tool-call' ? {...part, name: normalize(part.name)} : part)),
  }
}

export function normalizeHistoryToolNames(history: ChatHistory, registered: ReadonlySet<string>): ChatHistory {
  const normalize = makeToolNameNormalizer(registered)
  return history.map((message) => normalizeMessage(message, normalize))
}
