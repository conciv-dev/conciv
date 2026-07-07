import type {StreamChunk, TextOptions} from '@tanstack/ai'
import {BaseTextAdapter, type StructuredOutputOptions, type StructuredOutputResult} from '@tanstack/ai/adapters'
import type {HarnessImage} from '@conciv/protocol/harness-types'

type InputModalities = readonly ['text']
type MsgMeta = {text: unknown; image: unknown; audio: unknown; video: unknown; document: unknown}

export function lastUserModelText(messages: TextOptions['messages']): string {
  const last = messages.findLast((m) => m.role === 'user')
  if (!last || last.content === null) return ''
  if (typeof last.content === 'string') return last.content
  return last.content.flatMap((p) => (p.type === 'text' ? [p.content] : [])).join('\n')
}

export function lastUserImages(messages: TextOptions['messages']): HarnessImage[] {
  const last = messages.findLast((m) => m.role === 'user')
  if (!last || last.content === null || typeof last.content === 'string') return []
  return last.content.flatMap((p) => {
    if (p.type !== 'image' || p.source.type !== 'data') return []
    return [{mediaType: p.source.mimeType, dataBase64: p.source.value}]
  })
}

export type ChatStreamFn = (options: TextOptions<Record<string, never>>) => AsyncIterable<StreamChunk>

class DelegatingTextAdapter extends BaseTextAdapter<string, Record<string, never>, InputModalities, MsgMeta> {
  readonly name: string
  private readonly stream: ChatStreamFn

  constructor(name: string, stream: ChatStreamFn) {
    super({}, name)
    this.name = name
    this.stream = stream
  }

  chatStream(options: TextOptions<Record<string, never>>): AsyncIterable<StreamChunk> {
    return this.stream(options)
  }

  structuredOutput(_options: StructuredOutputOptions<Record<string, never>>): Promise<StructuredOutputResult<unknown>> {
    return Promise.reject(new Error(`harness '${this.name}' does not support structured output`))
  }
}

export function makeTextAdapter(name: string, stream: ChatStreamFn): DelegatingTextAdapter {
  return new DelegatingTextAdapter(name, stream)
}
