import {defineErrorCatalog} from 'evlog'

export const generatorErrors = defineErrorCatalog('publish.generator', {
  PACKAGE_EXISTS: {
    message: ({reason}: {reason: string}) => reason,
    fix: 'Pick another name, or remove the old package first.',
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
