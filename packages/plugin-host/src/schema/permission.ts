export * as Permission from './permission.js'

import {Schema} from 'effect'

export const Source = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('tool'),
    messageID: Schema.String,
    id: Schema.String,
  }),
]).annotate({identifier: 'Permission.Source'})
export type Source = typeof Source.Type

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
