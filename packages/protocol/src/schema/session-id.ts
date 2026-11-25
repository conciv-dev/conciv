import type {SessionId as ConcivSessionId} from '@conciv/types/chat-types'
import {Schema} from 'effect'
import {descending} from './identifier.js'
import {statics} from './schema.js'

const SESSION_ID_PATTERN = /^ses_[A-Za-z0-9_-]{1,128}$/

function isSessionId(value: string): value is ConcivSessionId {
  return SESSION_ID_PATTERN.test(value)
}

export const SessionId = Schema.String.check(Schema.isPattern(SESSION_ID_PATTERN)).pipe(
  Schema.refine(isSessionId),
  Schema.annotate({identifier: 'Session.ID'}),
  statics((schema) => ({create: () => schema.make('ses_' + descending())})),
)
export type SessionId = typeof SessionId.Type
