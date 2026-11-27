import {defineErrorCatalog} from 'evlog'

export const paneErrors = defineErrorCatalog('frontend-defaults.pane', {
  DRAFT_NOT_KEPT: {
    message: ({change}: {change: string}) => `neither this browser nor the engine holds the ${change} draft`,
    why: 'The browser storage and the engine both refused the draft.',
    fix: 'Copy the draft text somewhere safe, then reconnect and try again.',
  },
  RUN_FAILED: {
    message: 'The run failed',
  },
  SEND_REFUSED: {
    status: 409,
    message: 'The message was not sent',
  },
  SEND_SKIPPED: {
    message: 'The message was not sent',
    why: 'The send was withdrawn, empty, or waited on another step.',
  },
  PREVIEW_READ_ONLY: {
    status: 403,
    message: 'the session preview is read-only',
    fix: 'Open the session to write in it.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'frontend-defaults.pane': typeof paneErrors
  }
}
