export * as SessionErrors from './error.js'

import {Schema} from 'effect'
import {Session} from '../../schema/session.js'

export const NotFoundError = Schema.TaggedStruct('Session.NotFoundError', {
  sessionId: Session.Id,
})
export type NotFoundError = typeof NotFoundError.Type & globalThis.Error

export const makeNotFoundError = (fields: Omit<typeof NotFoundError.Type, '_tag'>): NotFoundError =>
  Object.assign(new globalThis.Error(), NotFoundError.make(fields), {name: 'Session.NotFoundError'})
