import {defineErrorCatalog} from 'evlog'

export const testUtilsErrors = defineErrorCatalog('frontend-test-utils', {
  UNANSWERED: {
    message: ({procedures}: {procedures: string}) =>
      `the fake engine was asked for what no test gave it: ${procedures}`,
    fix: 'Give the fake engine a handler for each procedure the test reaches.',
  },
  NOT_TRUSTED: {
    status: 401,
    message: 'the engine did not trust the test browser',
    fix: 'Start the engine with the token the test app binds to.',
  },
  BUNDLE_FILE_MISSING: {
    status: 404,
    message: ({id, file}: {id: string; file: string}) => `the build of the plugin ${id} has no file ${file}`,
    fix: 'Rebuild the plugin so its dist holds every chunk.',
  },
  BUNDLE_MANIFEST_MISSING: {
    status: 404,
    message: ({id}: {id: string}) => `the build of the plugin ${id} has no chunk manifest`,
    fix: 'Rebuild the plugin with the conciv plugin build.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'frontend-test-utils': typeof testUtilsErrors
  }
}
