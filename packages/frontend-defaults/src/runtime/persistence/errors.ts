import {defineErrorCatalog} from 'evlog'

export const draftStoreErrors = defineErrorCatalog('frontend-defaults.drafts', {
  NOT_WRITABLE: {
    status: 403,
    message: 'the draft store takes no writes while the engine does not trust this browser',
    fix: 'Trust this browser in the engine, then edit the draft again.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'frontend-defaults.drafts': typeof draftStoreErrors
  }
}
