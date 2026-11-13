import {Schema} from 'effect'
import {ToolCallID} from './ids.js'
import {ProviderMetadata} from './options.js'

export const ToolCall = Schema.Struct({
  type: Schema.tag('tool-call'),
  id: ToolCallID,
  name: Schema.String,
  namespace: Schema.optional(Schema.String),
  input: Schema.Unknown,
  providerExecuted: Schema.optional(Schema.Boolean),
  providerMetadata: Schema.optional(ProviderMetadata),
}).annotate({identifier: 'LLM.Event.ToolCall'})
export type ToolCall = Schema.Schema.Type<typeof ToolCall>
