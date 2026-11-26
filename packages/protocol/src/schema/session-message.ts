import {Schema} from 'effect'
import type {Maker} from './identifier.js'
import {statics} from './schema.js'

export const Id = Schema.String.check(Schema.isStartingWith('msg_')).pipe(
  Schema.brand('Session.Message.ID'),
  Schema.annotate({identifier: 'Session.Message.ID'}),
  statics((schema) => ({
    create: (ids: Maker) => schema.make('msg_' + ids.ascending()),
    fromEvent: (eventId: string) => schema.make(eventId.replace(/^evt_/, 'msg_')),
  })),
)
export type Id = typeof Id.Type
