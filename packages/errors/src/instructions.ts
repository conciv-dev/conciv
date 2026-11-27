import {defineErrorCatalog} from 'evlog'

export const instructionsErrors = defineErrorCatalog('instructions', {
  DUPLICATE_KEY: {
    status: 409,
    message: ({key}: {key: string}) => `Duplicate instruction key: ${key}`,
    fix: 'Give each instruction source its own key.',
  },
  EMPTY_RENDER: {
    message: ({key, kind}: {key: string; kind: string}) => `Instruction source ${key} rendered an empty ${kind}`,
    fix: 'Make the instruction source render some text.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    instructions: typeof instructionsErrors
  }
}
