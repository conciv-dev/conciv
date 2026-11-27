import {defineErrorCatalog} from 'evlog'

export const sessionErrors = defineErrorCatalog('backend.session', {
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
    'backend.session': typeof sessionErrors
  }
}
