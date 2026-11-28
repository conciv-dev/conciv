import {defineErrorCatalog} from 'evlog'

export const generatorErrors = defineErrorCatalog('publish.generator', {
  PACKAGE_EXISTS: {
    message: ({reason}: {reason: string}) => reason,
    fix: 'Pick another name, or remove the old package first.',
  },
  ENTRY_NAME_TAKEN: {
    message: ({name}: {name: string}) =>
      `a plugin with both parts cannot be named ${name}: its engine entry src/${name}.ts and the browser entry src/plugin-experimental.tsx would write the same dist/plugin-experimental declarations`,
    fix: 'Pick another name.',
  },
  LIST_NOT_FOUND: {
    message: ({path, marker}: {path: string; marker: string}) => `${path}: no list starts with ${marker}`,
  },
  COMMAND_FAILED: {
    message: ({command, exitCode}: {command: string; exitCode: number}) => `${command} exited with ${exitCode}`,
  },
  GENERATOR_FAILED: {
    message: ({failure}: {failure: string}) => `the package generator failed: ${failure}`,
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'publish.generator': typeof generatorErrors
  }
}
