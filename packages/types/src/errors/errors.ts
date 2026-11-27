import {defineErrorCatalog} from 'evlog'

export const typesErrors = defineErrorCatalog('types', {
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
    types: typeof typesErrors
  }
}
