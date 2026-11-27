import {defineErrorCatalog} from 'evlog'

export const terminalErrors = defineErrorCatalog('ui-kit-terminal', {
  OUTSIDE_ROOT: {
    message: 'useTerminal outside <TerminalPrimitive.Root>',
    fix: 'Render the part inside <TerminalPrimitive.Root>.',
  },
  CONNECTION_DROPPED: {
    status: 503,
    message: 'The terminal connection dropped.',
    why: 'The link to the terminal closed before it opened.',
    fix: 'Check that the engine is running, then reconnect the terminal.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'ui-kit-terminal': typeof terminalErrors
  }
}
