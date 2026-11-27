import {defineErrorCatalog} from 'evlog'

export const toolErrors = defineErrorCatalog('app-api.tool', {
  NAME_INVALID: {
    status: 400,
    message: ({name}: {name: string}) => `Invalid tool name: ${name}`,
    fix: 'Use only letters, digits and underscores in a tool name.',
  },
  NAME_RESERVED: {
    status: 400,
    message: 'Tool name "execute" is reserved for CodeMode',
    fix: 'Pick another name for the tool.',
  },
  INPUT_NOT_SCHEMA: {
    status: 400,
    message: ({id}: {id: string}) => `Invalid tool definition ${id}: input must be a schema`,
    fix: 'Give the tool input a zod, Effect or JSON schema.',
  },
  DEFINITION_INVALID: {
    status: 400,
    message: ({id, reason}: {id: string; reason: string}) => `Invalid tool definition ${id}: ${reason}`,
  },
  NAMESPACE_INVALID: {
    status: 400,
    message: ({name}: {name: string}) => `Invalid tool namespace: ${name}`,
    fix: 'Use dot-separated segments of letters, digits and underscores.',
  },
  SCHEMA_NOT_CONVERTIBLE: {
    message: ({vendor}: {vendor: string}) => `Schema vendor "${vendor}" does not support JSON Schema conversion`,
    fix: 'Use a zod, Effect or JSON schema for the tool.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'app-api.tool': typeof toolErrors
  }
}
