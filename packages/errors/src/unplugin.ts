import {defineErrorCatalog} from 'evlog'

export const unpluginErrors = defineErrorCatalog('unplugin', {
  ENGINE_START_FAILED: {message: 'conciv: the engine failed to start'},
  WIDGET_CLIENT_NOT_REWRITTEN: {
    message: ({port}: {port: number}) => `conciv: could not rewrite the widget client for port ${String(port)}`,
    why: 'The conciv state folder in the project could not be written.',
    fix: 'Check that the project folder is writable.',
  },
  ENGINE_NOT_STARTED: {
    message: 'the conciv engine has not started yet',
    fix: 'Wait for the dev server to finish starting, then try again.',
  },
  PACKAGE_FOLDER_NOT_FOUND: {message: 'conciv: the @conciv/unplugin package folder was not found'},
  INVALID_OPTIONS: {
    message: ({reason}: {reason: string}) => `conciv: CONCIV_OPTIONS is not a valid conciv config: ${reason}`,
    fix: 'Check the options passed to the conciv Next.js plugin.',
  },
  OPTIONS_NOT_JSON: {message: 'conciv: CONCIV_OPTIONS is not JSON'},
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    unplugin: typeof unpluginErrors
  }
}
