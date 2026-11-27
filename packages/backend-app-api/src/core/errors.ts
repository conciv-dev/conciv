import {defineErrorCatalog} from 'evlog'

export const coreErrors = defineErrorCatalog('app-api.core', {
  INVALID_DURABLE_EVENT: {
    message: ({type, reason}: {type: string; reason: string}) => `Invalid durable event ${type}: ${reason}`,
  },
  RPC_UNKNOWN_EVENT: {
    status: 404,
    message: ({event}: {event: string}) => `Unknown RPC event: ${event}`,
    fix: 'Declare the event in the rpc definition before you emit or subscribe to it.',
  },
  RPC_INPUT_INVALID: {
    status: 400,
    message: ({issues}: {issues: string}) => issues,
  },
  RPC_UNDECLARED_ERROR: {
    message: ({type}: {type: string}) => `Undeclared RPC error: ${type}`,
    fix: 'List the error type in the method errors of the rpc definition.',
  },
  RPC_DECLARED_ERROR: {
    message: ({type}: {type: string}) => `RPC error ${type}`,
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'app-api.core': typeof coreErrors
  }
}
