export * as Model from './model.js'

import {Schema, Struct} from 'effect'
import {optional, statics} from './schema.js'
import {Provider} from './provider.js'
import {Compatibility} from './model-compatibility.js'
import {Money} from './money.js'

export const Id = Schema.String.pipe(Schema.brand('Model.ID'))
export type Id = typeof Id.Type

export const VariantId = Schema.String.pipe(Schema.brand('Model.VariantID'))
export type VariantId = typeof VariantId.Type

export const Ref = Schema.Struct({
  id: Id,
  providerId: Provider.Id,
  variant: VariantId.pipe(optional),
}).annotate({identifier: 'Model.Ref'})
export interface Ref extends Schema.Schema.Type<typeof Ref> {}

export const Family = Schema.String.pipe(Schema.brand('Model.Family'))
export type Family = typeof Family.Type

export type Type = 'chat' | 'decision' | 'image' | (string & {})
export const Type: Schema.Codec<Type> = Schema.Union([
  Schema.Literals(['chat', 'decision', 'image']),
  Schema.String,
]).annotate({identifier: 'Model.Type'})

export const Settings = Schema.StructWithRest(
  Schema.Struct(Struct.pick(Provider.Settings.schema.fields, ['compaction', 'cache', 'encoding'])),
  [Schema.Record(Schema.String, Schema.Any)],
).annotate({identifier: 'Model.Settings'})
export type Settings = typeof Settings.Type

const VariantSettings = Schema.StructWithRest(
  Schema.Struct(Struct.omit(Settings.schema.fields, ['cache'])),
  Settings.records,
).annotate({identifier: 'Model.VariantSettings'})

export const Overlays = {
  settings: Settings.pipe(optional),
  headers: Schema.Record(Schema.String, Schema.String).pipe(optional),
  body: Schema.Record(Schema.String, Schema.Any).pipe(optional),
}

export interface Capabilities extends Schema.Schema.Type<typeof Capabilities> {}
export const Capabilities = Schema.Struct({
  tools: Schema.Boolean,
  input: Schema.Array(Schema.String),
  output: Schema.Array(Schema.String),
  temperature: Schema.Boolean.pipe(optional),
})
  .annotate({identifier: 'Model.Capabilities'})
  .pipe(
    statics(() => ({
      default: () => ({tools: true, input: ['text', 'image'], output: ['text']}) satisfies Capabilities,
    })),
  )

export interface Cost extends Schema.Schema.Type<typeof Cost> {}
export const Cost = Schema.Struct({
  tier: Schema.Struct({
    type: Schema.tag('context'),
    size: Schema.Int,
  }).pipe(optional),
  input: Money.USDPerMillionTokens,
  output: Money.USDPerMillionTokens,
  cache: Schema.Struct({
    read: Money.USDPerMillionTokens,
    write: Money.USDPerMillionTokens,
  }),
}).annotate({identifier: 'Model.Cost'})

export interface Variant extends Schema.Schema.Type<typeof Variant> {}
export const Variant = Schema.Struct({
  id: VariantId,
  ...Overlays,
  settings: VariantSettings.pipe(optional),
}).annotate({identifier: 'Model.Variant'})

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: Id,
  modelId: Id,
  providerId: Provider.Id,
  canonical: Provider.Id.pipe(optional),
  type: Type.pipe(optional),
  family: Family.pipe(optional),
  name: Schema.String,
  compatibility: Compatibility.pipe(optional),
  package: Provider.Package.pipe(optional),
  ...Overlays,
  capabilities: Capabilities,
  variants: Schema.Array(Variant),
  time: Schema.Struct({
    released: Schema.Finite,
  }),
  cost: Schema.Array(Cost),
  status: Schema.Literals(['alpha', 'beta', 'deprecated', 'active']),
  enabled: Schema.Boolean,
  limit: Schema.Struct({
    context: Schema.Int,
    input: Schema.Int.pipe(optional),
    output: Schema.Int,
  }),
})
  .annotate({identifier: 'Model.Info'})
  .pipe(
    statics(() => ({
      default: (providerId: Provider.Id, id: Id) =>
        ({
          id,
          modelId: id,
          providerId,
          name: id,
          capabilities: Capabilities.default(),
          variants: [],
          time: {released: 0},
          cost: [],
          status: 'active',
          enabled: true,
          limit: {context: 200_000, output: 32_000},
        }) satisfies Info,
    })),
  )
