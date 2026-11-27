import {defineErrorCatalog} from 'evlog'

export const tryItErrors = defineErrorCatalog('tryIt', {
  PROBE_FAILED: {
    message: ({port}: {port: number}) => `No conciv engine answered on port ${port}`,
  },
  PROBE_SILENT: {
    message: 'No local conciv engine answered',
    why: 'No engine is running on this machine, or it is still starting.',
    fix: 'Start the engine with the npx command shown in the panel, then wait for it to answer.',
  },
  PERMISSION_UNSUPPORTED: {
    message: 'This browser cannot report the local network access permission',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    tryIt: typeof tryItErrors
  }
}
