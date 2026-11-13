export * as Provider from './provider.js'

import {Effect, Schema} from 'effect'
import {optional, statics} from './schema.js'

export const Id = Schema.String.pipe(
  Schema.brand('Provider.ID'),
  Schema.annotate({identifier: 'Provider.ID'}),
  statics((schema) => ({
    opencode: schema.make('opencode'),
    anthropic: schema.make('anthropic'),
    openai: schema.make('openai'),
    google: schema.make('google'),
    googleVertex: schema.make('google-vertex'),
    githubCopilot: schema.make('github-copilot'),
    claudeAgent: schema.make('claude-agent'),
    amazonBedrock: schema.make('amazon-bedrock'),
    azure: schema.make('azure'),
    openrouter: schema.make('openrouter'),
    mistral: schema.make('mistral'),
    gitlab: schema.make('gitlab'),
  })),
)
export type Id = typeof Id.Type

export const Compaction = Schema.Union([
  Schema.Struct({type: Schema.Literal('summary')}),
  Schema.Struct({type: Schema.Literal('native')}),
])
  .pipe(Schema.toTaggedUnion('type'))
  .annotate({identifier: 'Provider.Compaction'})
export type Compaction = typeof Compaction.Type

export const Transport = Schema.Literals(['http', 'websocket']).annotate({identifier: 'Provider.Transport'})
export type Transport = typeof Transport.Type

export const CacheTTL = Schema.TemplateLiteral([Schema.Number, Schema.Literals(['ms', 's', 'm', 'h', 'd'])])
  .check(Schema.isPattern(/^\d+(ms|s|m|h|d)$/))
  .annotate({identifier: 'Provider.CacheTTL'})
export type CacheTTL = typeof CacheTTL.Type

export const CacheWarming = Schema.Union([
  Schema.Boolean,
  Schema.Struct({
    interval: Schema.Union([Schema.Literal('auto'), Schema.String])
      .pipe(optional)
      .annotate({description: 'Duration such as "4 minutes", or "auto" (default) for 90% of the model\'s cache.ttl'}),
    duration: Schema.String.pipe(optional).annotate({description: 'Duration such as "30 minutes"'}),
  }),
]).annotate({identifier: 'Provider.CacheWarming'})
export type CacheWarming = typeof CacheWarming.Type

export const Cache = Schema.Struct({
  ttl: CacheTTL.pipe(optional),
  warming: CacheWarming.pipe(optional),
}).annotate({identifier: 'Provider.Cache'})
export type Cache = typeof Cache.Type

export const Encoding = Schema.Literals(['zstd', 'gzip', 'none']).annotate({identifier: 'Provider.Encoding'})
export type Encoding = typeof Encoding.Type

const Timeout = Schema.Union([Schema.Finite, Schema.Literal(false)]).pipe(optional)

export const Settings = Schema.StructWithRest(
  Schema.Struct({
    timeout: Timeout,
    headerTimeout: Timeout,
    chunkTimeout: Timeout,
    compaction: Compaction.pipe(optional),
    cache: Cache.pipe(optional),
    transport: Transport.pipe(optional),
    encoding: Encoding.pipe(optional),
  }),
  [Schema.Record(Schema.String, Schema.Any)],
).annotate({identifier: 'Provider.Settings'})
export type Settings = typeof Settings.Type

export interface Request extends Schema.Schema.Type<typeof Request> {}
export const Request = Schema.Struct({
  settings: Settings.pipe(Schema.withConstructorDefault(Effect.succeed({}))),
  headers: Schema.Record(Schema.String, Schema.String),
  body: Schema.Record(Schema.String, Schema.Any),
}).annotate({identifier: 'Provider.Request'})
