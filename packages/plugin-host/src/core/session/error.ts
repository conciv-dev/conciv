export * as SessionErrors from './error.js'

import {Schema} from 'effect'
import {Agent} from '../../schema/agent.js'
import {Session} from '../../schema/session.js'
import {SessionMessage} from '../../schema/session-message.js'

export const NotFoundError = Schema.TaggedStruct('Session.NotFoundError', {
  sessionId: Session.Id,
})
export type NotFoundError = typeof NotFoundError.Type & globalThis.Error

export const makeNotFoundError = (fields: Omit<typeof NotFoundError.Type, '_tag'>): NotFoundError =>
  Object.assign(new globalThis.Error(), NotFoundError.make(fields), {name: 'Session.NotFoundError'})

export const InvalidListCursorError = Schema.TaggedStruct('Session.InvalidListCursorError', {})
export type InvalidListCursorError = typeof InvalidListCursorError.Type & globalThis.Error

export const makeInvalidListCursorError = (): InvalidListCursorError =>
  Object.assign(new globalThis.Error('Invalid cursor'), InvalidListCursorError.make({}), {
    name: 'Session.InvalidListCursorError',
  })

export const SyntheticConflictError = Schema.TaggedStruct('Session.SyntheticConflictError', {
  sessionId: Session.Id,
  inputId: SessionMessage.Id,
})
export type SyntheticConflictError = typeof SyntheticConflictError.Type & globalThis.Error

export const makeSyntheticConflictError = (
  fields: Omit<typeof SyntheticConflictError.Type, '_tag'>,
): SyntheticConflictError =>
  Object.assign(new globalThis.Error(), SyntheticConflictError.make(fields), {name: 'Session.SyntheticConflictError'})

export const CompactionConflictError = Schema.TaggedStruct('Session.CompactionConflictError', {
  sessionId: Session.Id,
  inputId: SessionMessage.Id,
})
export type CompactionConflictError = typeof CompactionConflictError.Type & globalThis.Error

export const makeCompactionConflictError = (
  fields: Omit<typeof CompactionConflictError.Type, '_tag'>,
): CompactionConflictError =>
  Object.assign(new globalThis.Error(), CompactionConflictError.make(fields), {
    name: 'Session.CompactionConflictError',
  })

export const AgentNotFoundError = Schema.TaggedStruct('Session.AgentNotFoundError', {
  sessionId: Session.Id,
  agent: Agent.Id,
})
export type AgentNotFoundError = typeof AgentNotFoundError.Type & globalThis.Error

export const makeAgentNotFoundError = (fields: Omit<typeof AgentNotFoundError.Type, '_tag'>): AgentNotFoundError =>
  Object.assign(new globalThis.Error(`Agent not found: "${fields.agent}"`), AgentNotFoundError.make(fields), {
    name: 'Session.AgentNotFoundError',
  })
