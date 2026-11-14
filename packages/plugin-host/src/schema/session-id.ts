import type {SessionInfo} from '@conciv/plugin'
import {Schema} from 'effect'

const SESSION_ID_PATTERN = /^conciv_[A-Za-z0-9_-]{1,128}$/

function isSessionId(value: string): value is SessionInfo['id'] {
  return SESSION_ID_PATTERN.test(value)
}

export const SessionId = Schema.String.check(Schema.isPattern(SESSION_ID_PATTERN)).pipe(
  Schema.refine(isSessionId),
  Schema.annotate({identifier: 'Session.ID'}),
)
export type SessionId = typeof SessionId.Type
