export * as SessionEvent from './session-event.js'

import {Schema} from 'effect'
import {optional} from './schema.js'
import {Event} from './event.js'
import {SessionID} from './session-id.js'

const Base = {
  sessionID: SessionID,
}

const options = {
  durable: {
    aggregate: 'sessionID',
    version: 1,
  },
} as const

export const Renamed = Event.durable({
  type: 'session.renamed',
  ...options,
  schema: {
    ...Base,
    title: Schema.String,
  },
})
export type Renamed = typeof Renamed.Type

export const Viewed = Event.durable({
  type: 'session.viewed',
  ...options,
  schema: {
    ...Base,
    idle: Schema.Finite,
  },
})
export type Viewed = typeof Viewed.Type

export const Archived = Event.durable({
  type: 'session.archived',
  ...options,
  schema: Base,
})
export type Archived = typeof Archived.Type

export const Unarchived = Event.durable({
  type: 'session.unarchived',
  ...options,
  schema: Base,
})
export type Unarchived = typeof Unarchived.Type

export const Deleted = Event.durable({
  type: 'session.deleted',
  durable: {
    aggregate: 'sessionID',
    version: 2,
  },
  schema: Base,
})
export type Deleted = typeof Deleted.Type

export namespace Execution {
  export const Started = Event.durable({type: 'session.execution.started', ...options, schema: Base})
  export type Started = typeof Started.Type

  export const Succeeded = Event.durable({type: 'session.execution.succeeded', ...options, schema: Base})
  export type Succeeded = typeof Succeeded.Type

  export const Interrupted = Event.durable({
    type: 'session.execution.interrupted',
    ...options,
    schema: {...Base, reason: Schema.Literals(['user', 'shutdown', 'superseded', 'inactivity'])},
  })
  export type Interrupted = typeof Interrupted.Type
}

export const Synthetic = Event.durable({
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

export const Definitions = Event.inventory(
  Renamed,
  Viewed,
  Archived,
  Unarchived,
  Deleted,
  Execution.Started,
  Execution.Succeeded,
  Execution.Interrupted,
  Synthetic,
)

export const DurableDefinitions = Event.inventory(
  ...Definitions.filter((definition) => definition.durability === 'durable'),
)
export const EphemeralDefinitions = Event.inventory(
  ...Definitions.filter((definition: Event.Definition) => definition.durability === 'ephemeral'),
)

export const Durable = Schema.Union(DurableDefinitions, {mode: 'oneOf'})
  .annotate({identifier: 'Session.Event.Durable'})
  .pipe(Schema.toTaggedUnion('type'))
export type DurableEvent = typeof Durable.Type

export const All = Schema.Union([Durable, ...EphemeralDefinitions], {mode: 'oneOf'}).pipe(Schema.toTaggedUnion('type'))
export type Event = typeof All.Type
export type Type = Event['type']
