import {EventType, type StreamChunk, type UIMessage} from '@tanstack/ai'
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

export function normalizeChunkToolName(chunk: StreamChunk, normalize: (name: string) => string): StreamChunk {
  if (chunk.type !== EventType.TOOL_CALL_START) return chunk
  const name = chunk.toolCallName ?? chunk.toolName
  if (typeof name !== 'string') return chunk
  const normalized = normalize(name)
  if (normalized === name) return chunk
  return {...chunk, toolCallName: normalized, toolName: normalized}
}
