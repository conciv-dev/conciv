export * as Permission from './permission.js'

import {Schema} from 'effect'

export const Source = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('tool'),
    messageId: Schema.String,
    id: Schema.String,
  }),
]).annotate({identifier: 'Permission.Source'})
export type Source = typeof Source.Type

export const Effect = Schema.Literals(['allow', 'deny', 'ask']).annotate({identifier: 'Permission.Effect'})
export type Effect = typeof Effect.Type
