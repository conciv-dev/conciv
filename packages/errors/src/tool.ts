import {defineErrorCatalog} from 'evlog'

export const toolErrors = defineErrorCatalog('tool', {
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
  TOOL_NAME_INVALID: {
    status: 400,
    message: ({name, rule}: {name: string; rule: string}) =>
      `tool "${name}": a tool name is a lowercase snake_case identifier matching ${rule}, so the code-mode isolate can bind it as a JavaScript function name; write page_click, never a dotted name`,
    fix: 'Rename the tool to lowercase snake_case, as page_click.',
  },
  STATE_IGNORE_UNWRITABLE: {
    message: ({file}: {file: string}) => `conciv: could not write ${file}`,
    fix: 'Check that the project folder is writable.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    tool: typeof toolErrors
  }
}
