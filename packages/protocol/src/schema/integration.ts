import {Schema} from 'effect'
import * as Connection from './connection.js'
import {ephemeral, inventory} from './event.js'
import * as Form from './form.js'
import type {Maker} from './identifier.js'
import {IntegrationId, IntegrationMethodId} from './integration-id.js'
import {optional, statics} from './schema.js'

export const Id = IntegrationId
export type Id = typeof Id.Type

export const MethodId = IntegrationMethodId
export type MethodId = typeof MethodId.Type

export interface OAuthMethod extends Schema.Schema.Type<typeof OAuthMethod> {}
export const OAuthMethod = Schema.Struct({
  id: MethodId,
  type: Schema.Literal('oauth'),
  label: Schema.String,
  form: optional(Form.Fields),
}).annotate({identifier: 'Integration.OAuthMethod'})

export interface CommandMethod extends Schema.Schema.Type<typeof CommandMethod> {}
export const CommandMethod = Schema.Struct({
  id: MethodId,
  type: Schema.Literal('command'),
  label: Schema.String,
  command: Schema.Array(Schema.String),
}).annotate({identifier: 'Integration.CommandMethod'})

export interface KeyMethod extends Schema.Schema.Type<typeof KeyMethod> {}
export const KeyMethod = Schema.Struct({
  type: Schema.Literal('key'),
  label: optional(Schema.String),
  form: optional(Form.Fields),
}).annotate({identifier: 'Integration.KeyMethod'})

export interface ExternalMethod extends Schema.Schema.Type<typeof ExternalMethod> {}
export const ExternalMethod = Schema.Struct({
  id: MethodId,
  type: Schema.Literal('external'),
  label: Schema.String,
  form: optional(Form.Fields),
}).annotate({identifier: 'Integration.ExternalMethod'})

export interface EnvMethod extends Schema.Schema.Type<typeof EnvMethod> {}
export const EnvMethod = Schema.Struct({
  type: Schema.Literal('env'),
  names: Schema.Array(Schema.String),
}).annotate({identifier: 'Integration.EnvMethod'})

export const Method = Schema.Union([OAuthMethod, CommandMethod, KeyMethod, ExternalMethod, EnvMethod])
  .pipe(Schema.toTaggedUnion('type'))
  .annotate({identifier: 'Integration.Method'})
export type Method = typeof Method.Type

const Updated = ephemeral({
  type: 'integration.updated',
  schema: {},
})
export const Event = {Updated, Definitions: inventory(Updated)}

export interface Ref extends Schema.Schema.Type<typeof Ref> {}
export const Ref = Schema.Struct({
  id: Id,
  name: Schema.String,
  metadata: optional(Schema.Record(Schema.String, Schema.Any)),
}).annotate({identifier: 'Integration.Ref'})

export const Info = Schema.Struct({
  id: Id,
  name: Schema.String,
  metadata: optional(Schema.Record(Schema.String, Schema.Any)),
  methods: Schema.Array(Method),
  connections: Schema.Array(Connection.Info),
}).annotate({identifier: 'Integration.Info'})
export interface Info extends Schema.Schema.Type<typeof Info> {}

export const AttemptId = Schema.String.pipe(
  Schema.brand('Integration.AttemptID'),
  Schema.annotate({identifier: 'Integration.AttemptID'}),
  statics((schema) => ({create: (ids: Maker) => schema.make('con_' + ids.ascending())})),
)
export type AttemptId = typeof AttemptId.Type

const AttemptTime = Schema.Struct({
  created: Schema.Number,
  expires: Schema.Number,
})

export interface Attempt extends Schema.Schema.Type<typeof Attempt> {}
export const Attempt = Schema.Struct({
  attemptId: AttemptId,
  url: Schema.String,
  instructions: Schema.String,
  mode: Schema.Literals(['auto', 'code']),
  paste: Schema.optionalKey(Schema.Literal(true)),
  time: AttemptTime,
}).annotate({identifier: 'Integration.Attempt'})

export const AttemptStatus = Schema.Union([
  Schema.Struct({status: Schema.Literal('pending'), time: AttemptTime}),
  Schema.Struct({status: Schema.Literal('complete'), time: AttemptTime}),
  Schema.Struct({status: Schema.Literal('failed'), message: Schema.String, time: AttemptTime}),
  Schema.Struct({status: Schema.Literal('expired'), time: AttemptTime}),
])
  .pipe(Schema.toTaggedUnion('status'))
  .annotate({identifier: 'Integration.AttemptStatus'})
export type AttemptStatus = typeof AttemptStatus.Type

export interface CommandAttempt extends Schema.Schema.Type<typeof CommandAttempt> {}
export const CommandAttempt = Schema.Struct({
  attemptId: AttemptId,
  time: AttemptTime,
}).annotate({identifier: 'Integration.CommandAttempt'})

export const CommandAttemptStatus = Schema.Union([
  Schema.Struct({status: Schema.Literal('pending'), message: optional(Schema.String), time: AttemptTime}),
  Schema.Struct({status: Schema.Literal('complete'), time: AttemptTime}),
  Schema.Struct({status: Schema.Literal('failed'), message: Schema.String, time: AttemptTime}),
  Schema.Struct({status: Schema.Literal('expired'), time: AttemptTime}),
])
  .pipe(Schema.toTaggedUnion('status'))
  .annotate({identifier: 'Integration.CommandAttemptStatus'})
export type CommandAttemptStatus = typeof CommandAttemptStatus.Type
