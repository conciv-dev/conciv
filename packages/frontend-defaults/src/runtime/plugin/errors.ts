import {defineErrorCatalog} from 'evlog'

export const runtimePluginErrors = defineErrorCatalog('frontend-defaults.plugin', {
  ID_TAKEN: {
    status: 409,
    message: ({id}: {id: string}) => `The plugin id "${id}" is already taken`,
    fix: 'Give the plugin an id no built-in or other plugin uses.',
  },
  OVERLAY_NOT_RENDERED: {
    message: ({part}: {part: string}) => `The overlay ${part} did not render`,
  },
  HOST_APIS_UNAVAILABLE: {
    message: 'Host APIs are unavailable',
    fix: 'Render this inside the host APIs provider.',
  },
  ATTACHMENT_UNAVAILABLE: {
    message: 'Plugin attachment is unavailable',
    fix: 'Render this inside the plugin attachment provider.',
  },
  COMPOSER_NOT_SHOWN: {
    status: 409,
    message: 'The composer is not shown',
    fix: 'Open the session panel before writing to its composer.',
  },
  COMPOSER_INPUT_NOT_READY: {
    status: 409,
    message: 'The composer input is not ready',
    fix: 'Wait for the composer to mount and try again.',
  },
  SERVER_UNAVAILABLE: {
    status: 503,
    message: 'The server that runs this plugin is unavailable',
    fix: 'Start the server for this plugin, or reconnect to the engine.',
  },
  SESSION_LOCATION_MISSING: {
    message: 'Session storage requires a session location',
    fix: 'Open the store from a session that has a location.',
  },
  NAMED_SERVER_UNAVAILABLE: {
    status: 503,
    message: ({server}: {server: string}) => `Server ${server} is unavailable`,
    fix: 'Start that server, or reconnect to the engine.',
  },
  CLIPBOARD_REFUSED: {
    message: 'Request failed',
    why: 'The browser refused to write to the clipboard.',
    fix: 'Focus the page and try again, or allow clipboard access for this site.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'frontend-defaults.plugin': typeof runtimePluginErrors
  }
}
