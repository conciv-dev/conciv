export * as SessionInbox from './session-inbox.js'

import {Schema} from 'effect'
import {optional} from './schema.js'
import {SessionId} from './session-id.js'
import {SessionMessage} from './session-message.js'

export const Delivery = Schema.Literals(['steer', 'queue']).annotate({identifier: 'Session.Inbox.Delivery'})
export type Delivery = typeof Delivery.Type

export interface SyntheticPayload extends Schema.Schema.Type<typeof SyntheticPayload> {}
export const SyntheticPayload = Schema.Struct({
  text: Schema.String,
  description: Schema.String.pipe(optional),
  metadata: Schema.Record(Schema.String, Schema.Json).pipe(optional),
}).annotate({identifier: 'Session.Inbox.SyntheticPayload'})

const SyntheticItem = Schema.Struct({type: Schema.tag('synthetic'), payload: SyntheticPayload, delivery: Delivery})

export const Item = Schema.Union([SyntheticItem]).pipe(
  Schema.toTaggedUnion('type'),
  Schema.annotate({identifier: 'Session.Inbox.Item'}),
)
export type Item = typeof Item.Type

const Enqueued = {
  id: SessionMessage.Id,
  sessionId: SessionId,
  time: Schema.Struct({created: Schema.Finite}),
}

export interface Synthetic extends Schema.Schema.Type<typeof Synthetic> {}
export const Synthetic = Schema.Struct({...Enqueued, ...SyntheticItem.fields}).annotate({
  identifier: 'Session.Inbox.Synthetic',
})

export const Info = Schema.Union([Synthetic]).pipe(
  Schema.toTaggedUnion('type'),
  Schema.annotate({identifier: 'Session.Inbox.Info'}),
)
export type Info = typeof Info.Type
