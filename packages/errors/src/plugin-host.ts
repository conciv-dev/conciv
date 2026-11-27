import {defineErrorCatalog} from 'evlog'

export const pluginHostErrors = defineErrorCatalog('plugin-host', {
  ENTRYPOINT_NOT_FOUND: {
    status: 404,
    message: ({target}: {target: string}) => `Plugin entrypoint not found: ${target}`,
    why: 'The package has no server or ./plugin-experimental export.',
    fix: 'Check the plugin name in the config, and that the package exports a plugin entry.',
  },
  EXPERIMENTAL_UNREADABLE: {
    message: ({entry}: {entry: string}) => `The ./plugin-experimental file ${entry} can't be read`,
  },
  EXPERIMENTAL_OPTIONS_NOT_JSON: {
    status: 400,
    message: 'Plugin options must be JSON to reach its ./plugin-experimental',
    fix: 'Give the plugin options made of plain JSON values only.',
  },
  CHUNK_MANIFEST_INVALID: {
    message: ({entry, problem}: {entry: string; problem: string}) => `The chunk manifest of ${entry} ${problem}`,
    fix: 'Rebuild the plugin so its chunk manifest matches its files.',
  },
  DEFINITION_INVALID: {
    message: 'Plugin must export a default definition with an id and an effect or setup function.',
    fix: 'Export default Plugin.define({id, setup}) from the plugin entry.',
  },
  DUPLICATE_ID: {
    status: 409,
    message: ({id}: {id: string}) => `Duplicate plugin ID: ${id}`,
    fix: 'Give each plugin its own id, or list it once.',
  },
  DUPLICATE_INSTANCE_IDS: {
    status: 409,
    message: ({ids}: {ids: string}) => `duplicate instance plugin ids: ${ids}`,
    fix: 'Give each plugin its own id, or list it once.',
  },
  REMOVE_NEEDS_TARGET: {
    status: 400,
    message: 'Plugin remove operation requires a target',
    fix: 'Write the plugin name after the minus sign, as "-name".',
  },
  MODULE_FILE_MISSING: {
    status: 404,
    message: ({resolved}: {resolved: string}) => `Cannot find module file ${resolved}`,
    fix: 'Check the import path, and that the file exists with one of the extensions conciv resolves.',
  },
  RPC_ERROR_RETURNED: {
    message: ({type}: {type: string}) => `RPC error ${type}`,
  },
  BUNDLER_HOOK_FAILED: {
    status: 500,
    message: ({hook, plugin, module, reason}: {hook: string; plugin: string; module: string; reason: string}) =>
      `conciv: the ${hook} hook of plugin ${plugin} failed on ${module}: ${reason}`,
    why: "The plugin's bundler part threw or failed while the dev server ran it.",
    fix: "Fix the plugin's bundler hook, or remove the plugin, and reload the page.",
  },
  BUNDLER_HOOKS_INVALID: {
    status: 400,
    message: ({plugin}: {plugin: string}) =>
      `conciv: the plugin ${plugin} registered a bundler hook that is not a function`,
    why: 'ctx.bundler.add takes transform, resolveId and load, each a function when set.',
    fix: 'Pass functions for the hooks the plugin sets, and leave the others out.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'plugin-host': typeof pluginHostErrors
  }
}
