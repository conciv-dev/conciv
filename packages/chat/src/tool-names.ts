import {ChatEventType, type ChatEvent, type ChatMessage} from '@conciv/ai'
import type {ChatHistory} from '@conciv/protocol/chat-types'

const MCP_PREFIX = /^mcp__.+?__/
const OPENCODE_BRIDGE_PREFIX = /^tanstack_/

function stripped(name: string): string {
  if (MCP_PREFIX.test(name)) return name.replace(MCP_PREFIX, '')
  if (OPENCODE_BRIDGE_PREFIX.test(name)) return name.replace(OPENCODE_BRIDGE_PREFIX, '')
  return name
}

export function makeToolNameNormalizer(registered: ReadonlySet<string>): (name: string) => string {
  return (name) => {
    if (registered.has(name)) return name
    const bare = stripped(name)
    return registered.has(bare) ? bare : name
  }
}

function normalizeMessage(message: ChatMessage, normalize: (name: string) => string): ChatMessage {
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

export function normalizeChunkToolName(chunk: ChatEvent, normalize: (name: string) => string): ChatEvent {
  if (chunk.type !== ChatEventType.TOOL_CALL_START) return chunk
  const normalized = normalize(chunk.toolCallName)
  if (normalized === chunk.toolCallName) return chunk
  return {...chunk, toolCallName: normalized}
}
