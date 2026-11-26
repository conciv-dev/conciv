import {Schema} from 'effect'

export const JsonSchema = Schema.Record(Schema.String, Schema.Unknown)
export type JsonSchema = Schema.Schema.Type<typeof JsonSchema>

export const ProviderMetadata = Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown)).annotate({
  identifier: 'LLM.ProviderMetadata',
})
export type ProviderMetadata = Schema.Schema.Type<typeof ProviderMetadata>

export const CacheTTL = Schema.TemplateLiteral([Schema.Number, Schema.Literals(['ms', 's', 'm', 'h', 'd'])]).check(
  Schema.isPattern(/^\d+(ms|s|m|h|d)$/),
)
export type CacheTTL = typeof CacheTTL.Type

export const CacheHint = Schema.Struct({
  type: Schema.Literals(['ephemeral', 'persistent']),
  ttl: Schema.optional(CacheTTL),
}).annotate({identifier: 'LLM.CacheHint'})
export type CacheHint = typeof CacheHint.Type
