export * as Permission from './permission.js'

import {Schema} from 'effect'
import {optional} from './schema.js'
import {ascending} from './identifier.js'
import {SessionId} from './session-id.js'
import {statics} from './schema.js'

export const Id = Schema.String.check(Schema.isStartingWith('per')).pipe(
  Schema.brand('Permission.ID'),
  Schema.annotate({identifier: 'Permission.ID'}),
  statics((schema) => ({create: (id?: string) => schema.make(id ?? 'per_' + ascending())})),
)
export type Id = typeof Id.Type

export const Source = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('tool'),
    messageId: Schema.String,
    id: Schema.String,
  }),
]).annotate({identifier: 'Permission.Source'})
export type Source = typeof Source.Type

const RequestFields = {
  sessionId: SessionId,
  action: Schema.String,
  resources: Schema.Array(Schema.String),
  save: Schema.Array(Schema.String).pipe(optional),
  metadata: Schema.Record(Schema.String, Schema.Unknown).pipe(optional),
  source: Source.pipe(optional),
  message: Schema.String.pipe(optional),
}

export const Request = Schema.Struct({
  id: Id,
  ...RequestFields,
}).annotate({identifier: 'Permission.Request'})
export interface Request extends Schema.Schema.Type<typeof Request> {}

export const Reply = Schema.Literals(['once', 'always', 'reject']).annotate({identifier: 'Permission.Reply'})
export type Reply = typeof Reply.Type

export const Effect = Schema.Literals(['allow', 'deny', 'ask']).annotate({identifier: 'Permission.Effect'})
export type Effect = typeof Effect.Type

export interface Rule extends Schema.Schema.Type<typeof Rule> {}
export const Rule = Schema.Struct({
  action: Schema.String,
  resource: Schema.String,
  effect: Effect,
}).annotate({identifier: 'Permission.Rule'})

export const Ruleset = Schema.Array(Rule).annotate({identifier: 'Permission.Ruleset'})
export type Ruleset = typeof Ruleset.Type
