import {Schema, Struct} from 'effect'
import {optional} from './schema.js'

export type ReasoningField = 'reasoning' | 'reasoning_content' | 'reasoning_text' | (string & {})
export const ReasoningField: Schema.Codec<ReasoningField> = Schema.Union([
  Schema.Literals(['reasoning', 'reasoning_content', 'reasoning_text']),
  Schema.String,
]).annotate({identifier: 'Model.ReasoningField'})

export const MaxTokensField = Schema.Literals(['max_completion_tokens', 'max_tokens']).annotate({
  identifier: 'Model.MaxTokensField',
})
export type MaxTokensField = typeof MaxTokensField.Type

export const MediaInput = Schema.Literals(['assets', 'state', 'root']).annotate({
  identifier: 'Model.MediaInput',
})
export type MediaInput = typeof MediaInput.Type

export const CacheFormat = Schema.Literals(['anthropic', 'alibaba']).annotate({identifier: 'Model.CacheFormat'})
export type CacheFormat = typeof CacheFormat.Type

export interface Compatibility extends Schema.Schema.Type<typeof Compatibility> {}
export const Compatibility = Schema.Struct({
  reasoningField: ReasoningField.pipe(optional),
  requireReasoning: Schema.Boolean.pipe(optional),
  maxTokensField: MaxTokensField.pipe(optional),
  requireFinishReason: Schema.Boolean.pipe(optional),
  requireAssistantAfterTool: Schema.Boolean.pipe(optional),
  supportsPromptCacheKey: Schema.Boolean.pipe(optional),
  streamUsage: Schema.Boolean.pipe(optional),
  cacheFormat: CacheFormat.pipe(optional),
  supportsThinkingBlockBinding: Schema.Boolean.pipe(optional),
  supportsEffortUpdates: Schema.Boolean.pipe(optional),
  mediaInput: MediaInput.pipe(optional),
}).annotate({identifier: 'Model.Compatibility'})

export interface ProviderCompatibility extends Schema.Schema.Type<typeof ProviderCompatibility> {}
export const ProviderCompatibility = Schema.Struct(
  Struct.omit(Compatibility.fields, ['supportsThinkingBlockBinding', 'supportsEffortUpdates']),
).annotate({identifier: 'Provider.Compatibility'})
