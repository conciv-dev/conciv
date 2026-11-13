import type {SessionInfo} from '@conciv/plugin'
import {Schema} from 'effect'

function isSessionId(value: string): value is SessionInfo['id'] {
  return value.startsWith('conciv_')
}

export const SessionId = Schema.String.check(Schema.isStartingWith('conciv_')).pipe(
  Schema.refine(isSessionId),
  Schema.annotate({identifier: 'Session.ID'}),
)
export type SessionId = typeof SessionId.Type
