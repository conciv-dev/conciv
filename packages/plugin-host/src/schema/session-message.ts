export * as SessionMessage from './session-message.js'

import {Schema} from 'effect'
import {ascending} from './identifier.js'
import {statics} from './schema.js'

export const ID = Schema.String.check(Schema.isStartingWith('msg_')).pipe(
  Schema.brand('Session.Message.ID'),
  Schema.annotate({identifier: 'Session.Message.ID'}),
  statics((schema) => ({
    create: () => schema.make('msg_' + ascending()),
    fromEvent: (eventID: string) => schema.make(eventID.replace(/^evt_/, 'msg_')),
  })),
)
export type ID = typeof ID.Type
