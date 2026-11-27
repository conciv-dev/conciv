import {defineErrorCatalog} from 'evlog'

export const instructionsErrors = defineErrorCatalog('instructions', {
  INITIALIZATION_BLOCKED: {
    message: ({keys}: {keys: string}) => `Instruction initialization blocked by unavailable sources: ${keys}`,
    why: 'An instruction source could not be read before the first turn of the session.',
  },
  DUPLICATE_KEY: {
    status: 409,
    message: ({key}: {key: string}) => `Duplicate instruction key: ${key}`,
    fix: 'Give each instruction source its own key.',
  },
  EMPTY_RENDER: {
    message: ({key, kind}: {key: string; kind: string}) => `Instruction source ${key} rendered an empty ${kind}`,
    fix: 'Make the instruction source render some text.',
  },
  VALUE_TOO_LARGE: {
    status: 413,
    message: ({actualBytes, maxBytes}: {actualBytes: number; maxBytes: number}) =>
      `Instruction entry value is ${actualBytes} bytes; the limit is ${maxBytes} bytes`,
    fix: 'Store a smaller value, or split it across several keys.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    instructions: typeof instructionsErrors
  }
}
