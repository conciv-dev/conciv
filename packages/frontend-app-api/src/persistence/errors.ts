import {defineErrorCatalog} from 'evlog'

export const persistenceErrors = defineErrorCatalog('frontend-app-api.persistence', {
  NOT_STORED: {
    status: 413,
    message: ({key}: {key: string}) => `${key} could not be stored in this browser`,
    why: 'The browser storage is full or refused the write.',
    fix: 'Free some browser storage for this site and try again.',
  },
  ASYNC_SCHEMA: {
    message: ({name}: {name: string}) => `The store ${name} has a schema that validates asynchronously`,
    fix: 'Give the store a schema that validates synchronously.',
  },
  NO_READ_BACK: {
    message: ({refused, field}: {refused: string; field: string}) =>
      `${refused}: it does not read back what it writes at ${field}; a converting schema needs an encode`,
    fix: 'Pass an encode that turns the stored value back into what the schema reads.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'frontend-app-api.persistence': typeof persistenceErrors
  }
}
