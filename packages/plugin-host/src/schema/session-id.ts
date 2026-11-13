import {Schema} from 'effect'

export const SessionId = Schema.String.check(Schema.isStartingWith('conciv_')).pipe(
  Schema.brand('SessionID'),
  Schema.annotate({identifier: 'Session.ID'}),
)
export type SessionId = typeof SessionId.Type
