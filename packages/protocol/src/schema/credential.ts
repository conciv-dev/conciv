import {Schema} from 'effect'
import {ephemeral, inventory} from './event.js'
import type {Maker} from './identifier.js'
import {IntegrationId, IntegrationMethodId} from './integration-id.js'
import {NonNegativeInt, optional, statics} from './schema.js'

export const Secret = Schema.Redacted(Schema.String)

export const Id = Schema.String.pipe(
  Schema.brand('Credential.ID'),
  Schema.annotate({identifier: 'Credential.ID'}),
  statics((schema) => ({create: (ids: Maker) => schema.make('cred_' + ids.ascending())})),
)
export type Id = typeof Id.Type

const Updated = ephemeral({
  type: 'credential.updated',
  schema: {integrationId: IntegrationId, credentialId: Id},
})
const Switched = ephemeral({
  type: 'credential.switched',
  schema: {integrationId: IntegrationId, credentialId: Schema.NullOr(Id)},
})
export const Event = {
  Updated,
  Switched,
  Definitions: inventory(Updated, Switched),
}

export interface OAuth extends Schema.Schema.Type<typeof OAuth> {}
export const OAuth = Schema.Struct({
  type: Schema.Literal('oauth'),
  methodId: IntegrationMethodId,
  refresh: Secret,
  access: Secret,
  expires: NonNegativeInt,
  metadata: optional(Schema.Record(Schema.String, Schema.Unknown)),
}).annotate({identifier: 'Credential.OAuth'})

export interface Key extends Schema.Schema.Type<typeof Key> {}
export const Key = Schema.Struct({
  type: Schema.Literal('key'),
  key: Secret,
  metadata: optional(Schema.Record(Schema.String, Schema.Unknown)),
}).annotate({identifier: 'Credential.Key'})

export interface External extends Schema.Schema.Type<typeof External> {}
export const External = Schema.Struct({
  type: Schema.Literal('external'),
  methodId: IntegrationMethodId,
  metadata: optional(Schema.Record(Schema.String, Schema.Unknown)),
}).annotate({identifier: 'Credential.External'})

export const Value = Schema.Union([OAuth, Key, External])
  .pipe(Schema.toTaggedUnion('type'))
  .annotate({identifier: 'Credential.Value'})
export type Value = Schema.Schema.Type<typeof Value>

export interface Entry extends Schema.Schema.Type<typeof Entry> {}
export const Entry = Schema.Struct({
  id: Id,
  integrationId: IntegrationId,
  label: Schema.String,
  active: Schema.Boolean,
  value: Value,
}).annotate({identifier: 'Credential.Entry'})

export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}
export const CreateInput = Schema.Struct({
  id: optional(Id),
  integrationId: IntegrationId,
  label: optional(Schema.String),
  value: Value,
  activate: optional(Schema.Boolean),
}).annotate({identifier: 'Credential.CreateInput'})
