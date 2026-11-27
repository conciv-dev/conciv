import {defineErrorCatalog} from 'evlog'

export const terminalErrors = defineErrorCatalog('terminal', {
  OPEN_FAILED: {
    message: 'Couldn’t open the terminal.',
    why: 'The engine did not start a terminal for this session.',
    fix: 'Check that the engine is still running, then press Retry.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    terminal: typeof terminalErrors
  }
}
