import {Schema} from 'effect'
import {CacheHint, JsonSchema} from './options.js'

const toolDefinitionFields = {
  name: Schema.String,
  description: Schema.String,
  inputSchema: JsonSchema,
  outputSchema: Schema.optional(JsonSchema),
  cache: Schema.optional(CacheHint),
  native: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
}

export type ToolDefinitionInput = Schema.Struct.Type<typeof toolDefinitionFields>

export const ToolDefinition = Schema.Struct({
  type: Schema.Literal('tool'),
  ...toolDefinitionFields,
}).annotate({identifier: 'LLM.ToolDefinition'})
export type ToolDefinition = typeof ToolDefinition.Type

export const makeToolDefinition = (input: ToolDefinition | ToolDefinitionInput): ToolDefinition =>
  ToolDefinition.make({...input, type: 'tool'})
