import {EventType, type AnyTextAdapter, type TextOptions} from '@tanstack/ai'
import {BaseTextAdapter, type StructuredOutputOptions, type StructuredOutputResult} from '@tanstack/ai/adapters'
import {acpCompatible, type AcpCompatibleConfig} from '@tanstack/ai-acp'
import {claudeCodeText, type ClaudeCodeTextConfig} from '@tanstack/ai-claude-code'
import {codexText, CODEX_MODELS, type CodexTextConfig} from '@tanstack/ai-codex'
import {opencodeText, type OpencodeTextConfig} from '@tanstack/ai-opencode'
import {SessionMessage} from '@conciv/plugin/schema/session-message'
import type {ChatEvent} from '@conciv/protocol/chat-event-types'

export type TextAdapter = AnyTextAdapter

type TextAdapterOptions = TextOptions<Record<string, never>>

type ChatStreamFn = (options: TextAdapterOptions) => AsyncIterable<ChatEvent>

type InputModalities = readonly ['text']
type MessageMetadata = {text: unknown; image: unknown; audio: unknown; video: unknown; document: unknown}

class DelegatingTextAdapter extends BaseTextAdapter<string, Record<string, never>, InputModalities, MessageMetadata> {
  readonly name: string
  private readonly stream: ChatStreamFn

  constructor(name: string, stream: ChatStreamFn) {
    super({}, name)
    this.name = name
    this.stream = stream
  }

  chatStream(options: TextAdapterOptions): AsyncIterable<ChatEvent> {
    return this.stream(options)
  }

  structuredOutput(_options: StructuredOutputOptions<Record<string, never>>): Promise<StructuredOutputResult<unknown>> {
    return Promise.reject(new Error(`harness '${this.name}' does not support structured output`))
  }
}

export function makeTextAdapter(name: string, stream: ChatStreamFn): TextAdapter {
  return new DelegatingTextAdapter(name, stream)
}

export function isSubagentChunk(chunk: ChatEvent): boolean {
  return 'subagentRunId' in chunk && chunk.subagentRunId !== undefined
}

function messageIds(): (given: string | undefined) => SessionMessage.Id {
  const own = new Map<string, SessionMessage.Id>()
  const latest: {id: SessionMessage.Id | null} = {id: null}
  return (given) => {
    const id = (given === undefined ? latest.id : own.get(given)) ?? SessionMessage.Id.create()
    if (given !== undefined) own.set(given, id)
    latest.id = id
    return id
  }
}

function stampedChunk(chunk: ChatEvent, ownId: (given: string | undefined) => SessionMessage.Id): ChatEvent {
  if (isSubagentChunk(chunk)) return chunk
  if (
    chunk.type === EventType.TEXT_MESSAGE_START ||
    chunk.type === EventType.TEXT_MESSAGE_CONTENT ||
    chunk.type === EventType.TEXT_MESSAGE_END
  ) {
    return {...chunk, messageId: ownId(chunk.messageId)}
  }
  if (chunk.type !== EventType.TOOL_CALL_START) return chunk
  return {...chunk, parentMessageId: ownId(chunk.parentMessageId || undefined)}
}

async function* stamped(stream: AsyncIterable<ChatEvent>): AsyncIterable<ChatEvent> {
  const ownId = messageIds()
  for await (const chunk of stream) yield stampedChunk(chunk, ownId)
}

export function stampMessageIds(adapter: TextAdapter): TextAdapter {
  const chatStream: TextAdapter['chatStream'] = (options) => stamped(adapter.chatStream(options))
  return new Proxy(adapter, {
    get: (target, key, receiver) => (key === 'chatStream' ? chatStream : Reflect.get(target, key, receiver)),
  })
}

export type ClaudeCodeOptions = ClaudeCodeTextConfig

export function claudeCode(model: string, options: ClaudeCodeOptions): TextAdapter {
  return claudeCodeText(model, options)
}

export type CodexOptions = CodexTextConfig

export const codexModels = CODEX_MODELS

export function codex(model: string, options: CodexOptions): TextAdapter {
  return codexText(model, options)
}

export type OpencodeOptions = OpencodeTextConfig

export function opencode(model: string, options: OpencodeOptions): TextAdapter {
  return opencodeText(model, options)
}

export type AcpOptions = AcpCompatibleConfig

export function acp(model: string, options: AcpOptions): TextAdapter {
  return acpCompatible(options)(model)
}
