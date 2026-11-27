import {defineErrorCatalog} from 'evlog'

export const vitestErrors = defineErrorCatalog('vitest', {
  DATABASE_NOT_DELETED: {
    message: ({name}: {name: string}) => `could not delete the database ${name}`,
  },
  LEFTOVER_BODY: {
    message: ({count, first}: {count: number; first: string}) =>
      `this test left ${count} element(s) in document.body after cleanup, the first ${first}`,
    why: 'The leftovers were removed so later files start on an empty page.',
    fix: 'Render through @internal/frontend-test-utils, which removes what it renders when the test ends.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    vitest: typeof vitestErrors
  }
}
