import type {SessionId as ConcivSessionId} from '@conciv/protocol/chat-types'
import {Schema} from 'effect'

const SESSION_ID_PATTERN = /^conciv_[A-Za-z0-9_-]{1,128}$/

function isSessionId(value: string): value is ConcivSessionId {
  return SESSION_ID_PATTERN.test(value)
}

export interface SessionIdSchema extends Schema.refine<ConcivSessionId, Schema.String> {}

export const SessionId: SessionIdSchema = Schema.String.check(Schema.isPattern(SESSION_ID_PATTERN)).pipe(
  Schema.refine(isSessionId),
  Schema.annotate({identifier: 'Session.ID'}),
)
export type SessionId = typeof SessionId.Type
