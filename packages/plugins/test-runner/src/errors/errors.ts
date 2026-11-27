import {defineErrorCatalog} from 'evlog'

export const testRunnerErrors = defineErrorCatalog('testRunner', {
  RUNNER_UNAVAILABLE: {
    message: 'The test runner is unavailable',
    why: 'The configured runner is not installed in the project, or its process stopped.',
    fix: 'Install the runner the test-runner plugin is configured with, or pick another one in its options.',
  },
  PLAYWRIGHT_NOT_FOUND: {
    message: 'playwright not found in the app (install @playwright/test)',
    fix: 'Add @playwright/test to the project dev dependencies.',
  },
  PLAYWRIGHT_CLI_FAILED: {message: 'The playwright command could not run'},
  PLAYWRIGHT_REPORT_UNREADABLE: {message: 'The playwright JSON report could not be read'},
  VITEST_LOAD_FAILED: {
    message: 'vitest could not be loaded from the project',
    fix: 'Add vitest to the project dev dependencies.',
  },
  VITEST_RUN_FAILED: {message: 'vitest failed while running'},
  RUN_READ_FAILED: {message: 'The test run could not be read from the engine'},
  EVENTS_FAILED: {message: 'The live test events stopped'},
})

export function causeFrom(
  thrown: unknown,
  internal?: Record<string, unknown>,
): {cause: Error; internal?: Record<string, unknown>} | {internal: Record<string, unknown>} {
  return thrown instanceof Error ? {cause: thrown, internal} : {internal: {...internal, thrown}}
}

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    testRunner: typeof testRunnerErrors
  }
}
