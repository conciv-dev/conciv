import {defineErrorCatalog} from 'evlog'

export const formErrors = defineErrorCatalog('form', {
  NOT_FOUND: {
    status: 404,
    message: ({id}: {id: string}) => `Form not found: ${id}`,
  },
  ALREADY_SETTLED: {
    status: 409,
    message: ({id}: {id: string}) => `Form already settled: ${id}`,
  },
  ALREADY_EXISTS: {
    status: 409,
    message: ({id}: {id: string}) => `Form already exists: ${id}`,
  },
  INVALID_ANSWER: {
    status: 400,
    message: ({reason}: {reason: string}) => reason,
  },
  INVALID_FORM: {
    status: 400,
    message: ({reason}: {reason: string}) => reason,
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    form: typeof formErrors
  }
}
