import {defineErrorCatalog} from 'evlog'

export const tryErrors = defineErrorCatalog('try', {
  INVALID_WORKSPACE: {
    message: 'workspace must be "." when provided',
    fix: 'Pass --workspace . to use the current folder, or leave it out for a fresh one.',
  },
  UNKNOWN_HARNESS: {
    message: ({id, known}: {id: string; known: string}) =>
      `conciv: unknown harness "${id}". Known harnesses: ${known}.`,
    fix: 'Pick one of the known harnesses.',
  },
  NO_FREE_PORT: {
    message: ({first, last}: {first: number; last: number}) => `no free port between ${first} and ${last}`,
    fix: 'Stop another conciv engine that is running, then try again.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    try: typeof tryErrors
  }
}
