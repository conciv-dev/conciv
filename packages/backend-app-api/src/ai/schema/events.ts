import {Schema} from 'effect'
import {ToolCallId} from './ids.js'
import {ProviderMetadata} from './options.js'

export const ToolCall = Schema.Struct({
  type: Schema.tag('tool-call'),
  id: ToolCallId,
  name: Schema.String,
  namespace: Schema.optional(Schema.String),
  input: Schema.Unknown,
  providerExecuted: Schema.optional(Schema.Boolean),
  providerMetadata: Schema.optional(ProviderMetadata),
}).annotate({identifier: 'LLM.Event.ToolCall'})
export type ToolCall = Schema.Schema.Type<typeof ToolCall>
