import {defineErrorCatalog} from 'evlog'
import {Schema} from 'effect'
import * as Session from '@conciv/protocol/schema/session'

export const sessionErrors = defineErrorCatalog('app-api.session', {
  INVALID_LIST_CURSOR: {
    status: 400,
    message: 'Invalid cursor',
    why: 'The cursor is not one a session list call returned.',
    fix: 'List again without a cursor, or pass the next cursor the last list call returned.',
  },
  AGENT_NOT_FOUND: {
    status: 404,
    message: ({agent}: {agent: string}) => `Agent not found: "${agent}"`,
    fix: 'Use the build agent.',
  },
  HARNESS_READ_FAILED: {
    message: ({sessionId}: {sessionId: string}) => `The harness of session ${sessionId} could not be read`,
  },
  SYNTHETIC_CONFLICT: {
    status: 409,
    message: ({inputId}: {inputId: string}) => `The message id ${inputId} is already taken by another session`,
    fix: 'Give the notice a new id, or leave the id out.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'app-api.session': typeof sessionErrors
  }
}

export const NotFoundError = Schema.TaggedStruct('Session.NotFoundError', {
  sessionId: Session.Id,
})
export type NotFoundError = typeof NotFoundError.Type & globalThis.Error

export const makeNotFoundError = (fields: Omit<typeof NotFoundError.Type, '_tag'>): NotFoundError =>
  Object.assign(new globalThis.Error(), NotFoundError.make(fields), {name: 'Session.NotFoundError'})
