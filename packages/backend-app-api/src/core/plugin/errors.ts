import {defineErrorCatalog} from 'evlog'

export const pluginErrors = defineErrorCatalog('app-api.plugin', {
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
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'app-api.plugin': typeof pluginErrors
  }
}
