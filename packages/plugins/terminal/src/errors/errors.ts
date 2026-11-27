import {defineErrorCatalog} from 'evlog'

export const terminalErrors = defineErrorCatalog('terminal', {
  OPEN_FAILED: {
    message: 'Couldn’t open the terminal.',
    why: 'The engine did not start a terminal for this session.',
    fix: 'Check that the engine is still running, then press Retry.',
  },
})

export function causeFrom(
  thrown: unknown,
  internal?: Record<string, unknown>,
): {cause: Error; internal?: Record<string, unknown>} | {internal: Record<string, unknown>} {
  return thrown instanceof Error ? {cause: thrown, internal} : {internal: {...internal, thrown}}
}

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    terminal: typeof terminalErrors
  }
}
