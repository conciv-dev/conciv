import {Schema} from 'effect'
import {optional} from './schema.js'
import * as EventDefinition from './event.js'
import * as Instruction from './instruction.js'
import {SessionId} from './session-id.js'
import * as SessionInbox from './session-inbox.js'
import * as SessionMessage from './session-message.js'

const Base = {
  sessionID: SessionId,
}

const options = {
  durable: {
    aggregate: 'sessionID',
    version: 1,
  },
} as const

export const Created = EventDefinition.durable({
  type: 'session.created',
  ...options,
  schema: {
    ...Base,
    title: Schema.String.pipe(optional),
  },
})
export type Created = typeof Created.Type

export const Renamed = EventDefinition.durable({
  type: 'session.renamed',
  ...options,
  schema: {
    ...Base,
    title: Schema.String,
  },
})
export type Renamed = typeof Renamed.Type

export const Viewed = EventDefinition.durable({
  type: 'session.viewed',
  ...options,
  schema: {
    ...Base,
    idle: Schema.Finite,
  },
})
export type Viewed = typeof Viewed.Type

export const Archived = EventDefinition.durable({
  type: 'session.archived',
  ...options,
  schema: Base,
})
export type Archived = typeof Archived.Type

export const Unarchived = EventDefinition.durable({
  type: 'session.unarchived',
  ...options,
  schema: Base,
})
export type Unarchived = typeof Unarchived.Type

export const Deleted = EventDefinition.durable({
  type: 'session.deleted',
  durable: {
    aggregate: 'sessionID',
    version: 2,
  },
  schema: Base,
})
export type Deleted = typeof Deleted.Type

export namespace Execution {
  export const Started = EventDefinition.durable({type: 'session.execution.started', ...options, schema: Base})
  export type Started = typeof Started.Type

  export const Succeeded = EventDefinition.durable({type: 'session.execution.succeeded', ...options, schema: Base})
  export type Succeeded = typeof Succeeded.Type

  export const Failed = EventDefinition.durable({
    type: 'session.execution.failed',
    ...options,
    schema: {...Base, error: Schema.String},
  })
  export type Failed = typeof Failed.Type

  export const Interrupted = EventDefinition.durable({
    type: 'session.execution.interrupted',
    ...options,
    schema: {...Base, reason: Schema.Literals(['user', 'shutdown', 'superseded', 'inactivity'])},
  })
  export type Interrupted = typeof Interrupted.Type
}

export const InstructionsUpdated = EventDefinition.durable({
  type: 'session.instructions.updated',
  durable: {
    aggregate: 'sessionID',
    version: 2,
  },
  schema: {
    ...Base,
    delta: Instruction.Delta,
    text: Schema.String.pipe(optional),
  },
})
export type InstructionsUpdated = typeof InstructionsUpdated.Type

export const Synthetic = EventDefinition.durable({
  type: 'session.synthetic',
  ...options,
  schema: {
    ...Base,
    text: Schema.String,
    description: Schema.String.pipe(optional),
    metadata: Schema.Record(Schema.String, Schema.Unknown).pipe(optional),
  },
})
export type Synthetic = typeof Synthetic.Type

const InboxRef = {
  ...Base,
  inboxID: SessionMessage.Id,
}

export const InboxDelivered = EventDefinition.durable({
  type: 'session.inbox.delivered',
  ...options,
  schema: InboxRef,
})
export type InboxDelivered = typeof InboxDelivered.Type

export const InboxEnqueued = EventDefinition.durable({
  type: 'session.inbox.enqueued',
  ...options,
  schema: {
    ...InboxRef,
    item: SessionInbox.Item,
  },
})
export type InboxEnqueued = typeof InboxEnqueued.Type

export const InboxCancelled = EventDefinition.durable({
  type: 'session.inbox.cancelled',
  ...options,
  schema: InboxRef,
})
export type InboxCancelled = typeof InboxCancelled.Type

export const InboxDeliveryChanged = EventDefinition.durable({
  type: 'session.inbox.delivery.changed',
  ...options,
  schema: {...InboxRef, delivery: SessionInbox.Delivery},
})
export type InboxDeliveryChanged = typeof InboxDeliveryChanged.Type

export const Definitions = EventDefinition.inventory(
  Created,
  Renamed,
  Viewed,
  Archived,
  Unarchived,
  Deleted,
  Execution.Started,
  Execution.Succeeded,
  Execution.Failed,
  Execution.Interrupted,
  InstructionsUpdated,
  Synthetic,
  InboxDelivered,
  InboxEnqueued,
  InboxCancelled,
  InboxDeliveryChanged,
)

export const DurableDefinitions = EventDefinition.inventory(
  ...Definitions.filter((definition) => definition.durability === 'durable'),
)
export const EphemeralDefinitions = EventDefinition.inventory(
  ...Definitions.filter((definition: EventDefinition.Definition) => definition.durability === 'ephemeral'),
)

export const Durable = Schema.Union(DurableDefinitions, {mode: 'oneOf'})
  .annotate({identifier: 'Session.Event.Durable'})
  .pipe(Schema.toTaggedUnion('type'))
export type DurableEvent = typeof Durable.Type

export const All = Schema.Union([Durable, ...EphemeralDefinitions], {mode: 'oneOf'}).pipe(Schema.toTaggedUnion('type'))
export type Event = typeof All.Type
export type Type = Event['type']
