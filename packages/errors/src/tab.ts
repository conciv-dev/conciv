import {defineErrorCatalog} from 'evlog'

export const tabErrors = defineErrorCatalog('tab', {
  OTHER_LOCATION: {
    status: 503,
    message: 'Session belongs to another location.',
    why: 'The session was started in another project folder than this engine serves.',
    fix: 'Open the tab on the engine that serves the session folder.',
  },
  NOT_OPEN: {
    status: 503,
    message: 'The browser tab is not open on this engine.',
    why: 'The tab closed, or it is open on another engine.',
    fix: 'Open the tab on this engine and try again.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    tab: typeof tabErrors
  }
}
