import {defineErrorCatalog} from 'evlog'

export const testUtilsErrors = defineErrorCatalog('backend-test-utils', {
  DISK_IN_BROWSER: {
    message: ({target}: {target: string}) =>
      `pluginDirectory(${target}) reads the disk: call it in a node test, not in browser mode`,
  },
  FUNCTION_REPLY_IN_BROWSER: {
    message: 'a function reply cannot cross to the engine in browser mode',
    fix: 'Script the reply as data with TestLLM, or move the test to node.',
  },
  HARNESS_IN_BROWSER: {
    message: 'a harness adapter cannot cross to the engine in browser mode',
    fix: 'Move the test to node to pass a harness adapter.',
  },
  PLUGIN_OBJECT_IN_BROWSER: {
    message: 'in browser mode start.plugins names each plugin by its package name',
    fix: 'Pass the plugin package name instead of the plugin object.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'backend-test-utils': typeof testUtilsErrors
  }
}
