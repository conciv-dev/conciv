import {defineErrorCatalog} from 'evlog'

export const pluginApiErrors = defineErrorCatalog('plugin-api', {
  MODULE_FILE_MISSING: {
    status: 404,
    message: ({resolved}: {resolved: string}) => `Cannot find module file ${resolved}`,
    fix: 'Check the import path, and that the file exists with one of the extensions conciv resolves.',
  },
  RPC_ERROR_RETURNED: {
    message: ({type}: {type: string}) => `RPC error ${type}`,
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'plugin-api': typeof pluginApiErrors
  }
}
