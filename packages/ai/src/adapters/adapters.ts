import type {AnyTextAdapter, TextOptions} from '@tanstack/ai'
import {BaseTextAdapter, type StructuredOutputOptions, type StructuredOutputResult} from '@tanstack/ai/adapters'
import {
  acpCompatible,
  type AcpCompatibleConfig,
  type AcpPermissionOutcome as LibraryAcpPermissionOutcome,
  type AcpPermissionRequest as LibraryAcpPermissionRequest,
} from '@tanstack/ai-acp'
import {claudeCodeText, type ClaudeCodeTextConfig} from '@tanstack/ai-claude-code'
import {codexText, CODEX_MODELS, type CodexTextConfig} from '@tanstack/ai-codex'
import {
  opencodeText,
  OPENCODE_MODELS,
  type OpencodePermissionRequest as LibraryOpencodePermissionRequest,
  type OpencodeTextConfig,
} from '@tanstack/ai-opencode'
import type {ChatEvent} from '../events/events.js'

export type TextAdapter = AnyTextAdapter

export type TextAdapterOptions = TextOptions<Record<string, never>>

export type ChatStreamFn = (options: TextAdapterOptions) => AsyncIterable<ChatEvent>

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

export type ClaudeCodeOptions = ClaudeCodeTextConfig

export function claudeCode(model: string, options: ClaudeCodeOptions): TextAdapter {
  return claudeCodeText(model, options)
}

export type CodexOptions = CodexTextConfig

export const codexModels: readonly string[] = CODEX_MODELS

export function codex(model: string, options: CodexOptions): TextAdapter {
  return codexText(model, options)
}

export type OpencodeOptions = OpencodeTextConfig

export type OpencodePermissionRequest = LibraryOpencodePermissionRequest

export const opencodeModels: readonly string[] = OPENCODE_MODELS

export function opencode(model: string, options: OpencodeOptions): TextAdapter {
  return opencodeText(model, options)
}

export type AcpOptions = AcpCompatibleConfig

export type AcpPermissionRequest = LibraryAcpPermissionRequest

export type AcpPermissionOutcome = LibraryAcpPermissionOutcome

export function acp(model: string, options: AcpOptions): TextAdapter {
  return acpCompatible(options)(model)
}
