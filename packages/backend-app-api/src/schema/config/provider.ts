import {Schema, Struct} from 'effect'
import * as Money from '@conciv/protocol/schema/money'
import * as Model from '@conciv/protocol/schema/model'
import {Compatibility, ProviderCompatibility} from '@conciv/protocol/schema/model-compatibility'
import * as Provider from '@conciv/protocol/schema/provider'
import {optional} from '@conciv/protocol/schema/schema'

export const Settings = Schema.StructWithRest(Schema.Struct(Provider.Settings.schema.fields), [
  Schema.Record(Schema.String, Schema.UndefinedOr(Schema.Json)),
]).annotate({identifier: 'Config.Provider.Settings'})
export type Settings = typeof Settings.Type

export const ModelSettings = Schema.StructWithRest(Schema.Struct(Model.Settings.schema.fields), [
  Schema.Record(Schema.String, Schema.UndefinedOr(Schema.Json)),
]).annotate({identifier: 'Config.Model.Settings'})
export type ModelSettings = typeof ModelSettings.Type

const JsonRecord = Schema.Record(Schema.String, Schema.Json)

export const Overlays = {
  settings: Settings.pipe(optional),
  headers: Schema.Record(Schema.String, Schema.String).pipe(optional),
  body: JsonRecord.pipe(optional),
}

const ModelOverlays = {
  settings: ModelSettings.pipe(optional),
  headers: Schema.Record(Schema.String, Schema.String).pipe(optional),
  body: JsonRecord.pipe(optional),
}

export interface Request extends Schema.Schema.Type<typeof Request> {}
export const Request = Schema.Struct({
  headers: Overlays.headers,
  body: Overlays.body,
}).annotate({identifier: 'Config.Provider.Request'})

const Cache = Schema.Struct({
  read: Money.USDPerMillionTokens.pipe(optional),
  write: Money.USDPerMillionTokens.pipe(optional),
}).annotate({identifier: 'Config.Model.Cost.Cache'})

const Cost = Schema.Struct({
  tier: Schema.Struct({
    type: Schema.Literal('context'),
    size: Schema.Int,
  }).pipe(optional),
  input: Money.USDPerMillionTokens,
  output: Money.USDPerMillionTokens,
  cache: Cache.pipe(optional),
}).annotate({identifier: 'Config.Model.Cost'})

const Limit = Schema.Struct({
  context: Schema.Int.pipe(optional),
  input: Schema.Int.pipe(optional),
  output: Schema.Int.pipe(optional),
}).annotate({identifier: 'Config.Model.Limit'})

export const Reasoning = Schema.Union([
  Schema.Struct({supported: Schema.Literal(false)}),
  Schema.Struct({
    supported: Schema.Literal(true),
    toggle: Schema.Boolean.pipe(optional),
    effort: Schema.String.pipe(Schema.Array, optional),
    budget: Schema.Struct({
      min: Schema.Int.pipe(optional),
      max: Schema.Int.pipe(optional),
    }).pipe(optional),
  }),
]).annotate({identifier: 'Config.Model.Reasoning'})
export type Reasoning = typeof Reasoning.Type

const ModelConfig = Schema.Struct({
  modelId: Model.Id.pipe(optional),
  type: Model.Type.pipe(optional),
  family: Model.Family.pipe(optional),
  name: Schema.String.pipe(optional),
  releaseDate: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}(-\d{2})?$/u))
    .annotate({description: 'Release date as YYYY-MM-DD or YYYY-MM'})
    .pipe(optional),
  compatibility: Compatibility.pipe(optional),
  package: Schema.String.pipe(optional),
  ...ModelOverlays,
  capabilities: Model.Capabilities.mapFields((fields) => ({
    tools: optional(fields.tools),
    freeform: fields.freeform,
    input: optional(fields.input),
    output: optional(fields.output),
    temperature: fields.temperature,
    reasoning: Reasoning.pipe(optional),
  }))
    .annotate({identifier: 'Config.Model.Capabilities'})
    .pipe(optional),
  variants: Schema.Struct({
    id: Model.VariantId,
    ...ModelOverlays,
    settings: Schema.StructWithRest(
      Schema.Struct(Struct.omit(ModelSettings.schema.fields, ['cache'])),
      ModelSettings.records,
    )
      .annotate({identifier: 'Config.Model.VariantSettings'})
      .pipe(optional),
  }).pipe(Schema.Array, optional),
  cost: Schema.Union([Cost, Cost.pipe(Schema.Array)]).pipe(optional),
  disabled: Schema.Boolean.pipe(optional),
  limit: Limit.pipe(optional),
}).annotate({identifier: 'Config.Model'})

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  canonical: Provider.Id.pipe(optional),
  name: Schema.String.pipe(optional),
  env: Schema.String.pipe(Schema.Array, optional),
  package: Schema.String.pipe(optional),
  compatibility: ProviderCompatibility.pipe(optional),
  ...Overlays,
  models: Schema.Record(Schema.String, ModelConfig).pipe(optional),
}).annotate({identifier: 'Config.Provider'})
