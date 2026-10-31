import {z} from 'zod'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {toModelMessages, type ChatMessage} from '@conciv/protocol/chat-message-types'
import type {ChatStores} from '@conciv/ai/server'
import {anchorKey, TRANSCRIPT_NAMESPACE} from '@conciv/db'
import type {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import type {HarnessAdapter} from '@conciv/harness'

const MCP_PREFIX = /^mcp__.+?__/

const OPENCODE_TOOL_PREFIX = /^tanstack_/

export function toolNameNormalizer(registered: ReadonlySet<string>): (name: string) => string {
  return (name) => {
    if (registered.has(name)) return name
    const bare = name.replace(MCP_PREFIX, '').replace(OPENCODE_TOOL_PREFIX, '')
    return registered.has(bare) ? bare : name
  }
}

export function normalizedChunk(chunk: ChatEvent, normalize: (name: string) => string): ChatEvent {
  if (chunk.type !== ChatEventType.TOOL_CALL_START) return chunk
  const name = normalize(chunk.toolCallName)
  return name === chunk.toolCallName ? chunk : {...chunk, toolCallName: name}
}

const ObservedMetadataSchema = z.looseObject({sandboxObserved: z.literal(true)})

const RunMetadataSchema = z.object({tanstack: z.object({run: z.object({id: z.string()})})})

function runOf(message: ChatMessage): string | null {
  const parsed = RunMetadataSchema.safeParse(message.metadata)
  return parsed.success ? parsed.data.tanstack.run.id : null
}

function sameTurn(previous: ChatMessage, message: ChatMessage): boolean {
  if (previous.id === message.id) return true
  if (previous.role !== 'assistant' || message.role !== 'assistant') return false
  const run = runOf(message)
  return run !== null && run === runOf(previous)
}

type ToolCallPart = Extract<ChatMessage['parts'][number], {type: 'tool-call'}>

function cardOf(part: ToolCallPart, normalize: (name: string) => string): ToolCallPart {
  const named = {...part, name: normalize(part.name)}
  const metadata = ObservedMetadataSchema.safeParse('metadata' in part ? part.metadata : null)
  if (!metadata.success) return named
  const {sandboxObserved: _observed, ...shown} = metadata.data
  const card = {...named, metadata: shown}
  return card
}

export function normalizedMessages(messages: ChatMessage[], normalize: (name: string) => string): ChatMessage[] {
  const rejoined = messages.reduce<ChatMessage[]>((joined, message) => {
    const previous = joined.at(-1)
    if (previous === undefined || !sameTurn(previous, message)) return [...joined, message]
    return [...joined.slice(0, -1), {...previous, parts: [...previous.parts, ...message.parts]}]
  }, [])
  return rejoined.map((message) => ({
    ...message,
    parts: message.parts.map((part) => (part.type === 'tool-call' ? cardOf(part, normalize) : part)),
  }))
}

const AnchorSchema = z.object({nativeId: z.string().nullable()}).nullable().catch(null)

export type TranscriptSource = {
  harness: HarnessAdapter
  stores: ChatStores
  claudeHome?: string
  toolNames: ReadonlySet<string>
  native: (sessionId: SessionId) => {nativeId: HarnessSessionId; cwd: string} | null
  log: (message: string) => void
}

export type TranscriptImporter = {
  sync: (sessionId: SessionId) => Promise<void>
  settle: (sessionId: SessionId) => Promise<void>
}

export function createTranscriptImporter(source: TranscriptSource): TranscriptImporter {
  const {harness, stores} = source
  const normalize = toolNameNormalizer(source.toolNames)
  const read = async (sessionId: SessionId): Promise<ChatMessage[] | null> => {
    const history = harness.history
    const native = source.native(sessionId)
    if (!harness.capabilities.transcriptHistory || history === undefined || native === null) return null
    try {
      return await history.messages(native.cwd, native.nativeId, source.claudeHome)
    } catch (error) {
      source.log(`[chat] reading the transcript of ${native.nativeId} failed: ${String(error)}`)
      return null
    }
  }
  const anchorOf = async (sessionId: SessionId) =>
    AnchorSchema.parse(await stores.metadata.get(TRANSCRIPT_NAMESPACE, anchorKey(sessionId)))
  const advance = async (sessionId: SessionId, transcript: ChatMessage[]): Promise<void> => {
    const tail = transcript.at(-1)
    if (tail === undefined) return
    await stores.metadata.set(TRANSCRIPT_NAMESPACE, anchorKey(sessionId), {nativeId: tail.id})
  }
  return {
    sync: async (sessionId) => {
      const transcript = await read(sessionId)
      if (transcript === null) return
      const anchor = await anchorOf(sessionId)
      const anchored = anchor === null ? -1 : transcript.findIndex((message) => message.id === anchor.nativeId)
      const fresh = anchor !== null && anchored === -1 ? [] : transcript.slice(anchored + 1)
      const stored = await stores.messages.loadThread(sessionId)
      const known = new Set(stored.flatMap((message) => ('id' in message && message.id ? [message.id] : [])))
      const novel = normalizedMessages(fresh, normalize).filter((message) => !known.has(message.id))
      if (novel.length > 0) await stores.messages.saveThread(sessionId, [...stored, ...toModelMessages(novel)])
      await advance(sessionId, transcript)
    },
    settle: async (sessionId) => {
      const transcript = await read(sessionId)
      if (transcript !== null) await advance(sessionId, transcript)
    },
  }
}
