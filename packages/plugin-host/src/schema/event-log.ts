export * as EventLog from './event-log.js'

import {Schema} from 'effect'
import {Event} from '@conciv/plugin/schema/event'
import {optional} from '@conciv/plugin/schema/schema'

export const Synced = Schema.Struct({
  type: Schema.Literal('log.synced'),
  aggregateID: Schema.String,
  seq: optional(Event.Seq),
}).annotate({
  identifier: 'EventLog.Synced',
  description:
    'Marker emitted once when a log read reaches its captured watermark. The reader holds every event committed at or below seq.',
})
export interface Synced extends Schema.Schema.Type<typeof Synced> {}
