import {defineErrorCatalog} from 'evlog'

export const designErrors = defineErrorCatalog('design', {
  INVALID_OPTIONS: {
    status: 400,
    message: ({detail}: {detail: string}) => `Invalid design plugin options: ${detail}`,
    fix: 'Fix the design options in the conciv config.',
  },
  UNPARSED: {
    message: ({file, detail}: {file: string; detail: string}) => `${file} could not be parsed: ${detail}`,
  },
  UNREADABLE: {
    message: ({file, detail}: {file: string; detail: string}) => `${file} could not be read: ${detail}`,
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    design: typeof designErrors
  }
}
