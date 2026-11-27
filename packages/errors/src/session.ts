import {defineErrorCatalog} from 'evlog'

export const sessionErrors = defineErrorCatalog('session', {
  NOT_FOUND: {
    status: 404,
    message: ({sessionId}: {sessionId: string}) => `Session not found: ${sessionId}`,
    why: 'No session with that id exists, or it was deleted.',
    fix: 'List the sessions and use an id from that list.',
  },
  DELETED: {
    status: 410,
    message: ({sessionId}: {sessionId: string}) => `session "${sessionId}" does not exist`,
    why: 'The session was deleted, so it takes no more messages.',
    fix: 'Start a new session, or restore the deleted one.',
  },
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
  INSTRUCTION_STATE_MISSING: {
    message: ({sessionId}: {sessionId: string}) => `Instruction state not found during assembly: ${sessionId}`,
  },
  LIFECYCLE_CONFLICT: {
    status: 409,
    message: ({id}: {id: string}) => `Inbox item ${id} conflicts with what is already stored`,
    why: 'Another request already admitted, moved or removed this item.',
  },
  INSTRUCTION_BLOB_MISSING: {
    message: ({hash}: {hash: string}) => `Instruction blob not found: ${hash}`,
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    session: typeof sessionErrors
  }
}
