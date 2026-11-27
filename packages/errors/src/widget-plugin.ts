import {defineErrorCatalog} from 'evlog'

export const widgetPluginErrors = defineErrorCatalog('widget-plugin', {
  NOT_FOUND: {
    status: 404,
    message: 'Plugin not found',
    why: 'No plugin with this id is listed by the engine or defined in this browser.',
    fix: 'Reload the plugin list and pick a plugin from it.',
  },
  BUILTIN: {
    status: 409,
    message: 'A built-in plugin cannot be turned on or off',
    why: 'Built-in plugins ship with conciv and are always on.',
  },
  ENABLE_STREAM_ENDED: {
    message: 'the plugin enable state stream ended',
    why: 'The engine closed the stream that reports which plugins are on.',
    fix: 'Reconnect to the engine; the stream starts again on reconnect.',
  },
  SOURCE_DISPOSED: {
    message: 'the plugin manager was disposed',
    why: 'The plugin source stopped before it could answer.',
  },
  TRUST_ENDED_BEFORE_LISTING: {
    message: 'the engine trust ended before the engine first listed its plugins',
    fix: 'Trust this browser in the engine again to load its plugins.',
  },
  HOST_UNAVAILABLE: {
    message: 'Plugin host is unavailable',
    fix: 'Render this inside the plugin host provider.',
  },
  SERVERS_UNAVAILABLE: {
    message: 'Plugin servers are unavailable',
    fix: 'Render this inside the plugin servers provider.',
  },
  DIALOG_OUTSIDE_PROVIDER: {
    message: 'useDialog must be used within a DialogProvider',
    fix: 'Call useDialog from a component rendered inside a DialogProvider.',
  },
  NO_WINDOW: {
    message: ({purpose}: {purpose: string}) => `The document has no window to ${purpose}`,
    why: 'The document is detached from any window, so it cannot hold styles.',
  },
  LIST_TIMED_OUT: {
    message: ({milliseconds}: {milliseconds: number}) => `Plugin listing timed out after ${milliseconds} ms`,
    why: 'The engine did not answer the plugin list in time.',
    fix: 'Check that the engine is running; the list is asked again on reconnect.',
  },
  EXPERIMENTALS_NOT_LISTED: {
    message: 'The engine did not list plugin experimentals',
    why: 'The engine did not answer in time.',
    fix: 'Check that the engine is running; the list is asked again on reconnect.',
  },
  STORE_DISPOSED: {
    message: 'Plugin store disposed',
    why: 'The plugin store closed before its first value loaded.',
  },
  UPDATE_RETURNED_VALUE: {
    message: 'Persisted.update must not return a value. Use set(next) to replace the value.',
    fix: 'Change the draft inside update without returning it, or call set(next).',
  },
  NO_ENGINE_CONNECTION: {
    message: ({file, id}: {file: string; id: string}) =>
      `conciv has no engine connection to load ${file} of the plugin ${id}`,
    fix: 'Connect the widget to an engine and reload the plugin.',
  },
  ACTIVATION_TIMED_OUT: {
    message: 'Plugin activation timed out',
    why: 'The plugin did not finish loading in time.',
    fix: 'Reload the plugin; if it keeps timing out, check its window setup.',
  },
  MODULE_NOT_SHARED: {
    message: ({name}: {name: string}) =>
      `A plugin's ./plugin-experimental bundle requires a module the app does not share: ${name}`,
    fix: 'Import only the modules conciv shares, or bundle this module into the plugin.',
  },
  ENTRY_NOT_EVALUATED: {
    message: ({requirer, entry}: {requirer: string; entry: string}) =>
      `A plugin's ./plugin-experimental ${requirer} requires the entry ${entry} before it finished evaluating`,
    fix: 'Break the import cycle between the chunk and the bundle entry.',
  },
  CHUNK_NOT_SENT: {
    message: ({requirer, file}: {requirer: string; file: string}) =>
      `A plugin's ./plugin-experimental ${requirer} requires the chunk ${file}, which the engine did not send before it`,
    fix: 'Rebuild the plugin so the engine sends its chunks together.',
  },
  CHUNK_MISSING: {
    message: ({file}: {file: string}) => `The engine answered without the chunk ${file}`,
    fix: 'Rebuild the plugin and reload it.',
  },
  BUNDLE_NOT_PLUGIN: {
    message: ({problem}: {problem: string}) =>
      `A plugin's ./plugin-experimental bundle must default-export a \`Plugin.define\` from \`@conciv/frontend-plugin-api\`: ${problem}`,
    fix: 'Default-export the result of Plugin.define from the bundle entry.',
  },
  BUNDLE_NO_SETUP: {
    message: "A plugin's ./plugin-experimental bundle must have a window `setup`",
    fix: 'Give the Plugin.define call a window setup function.',
  },
  SETUP_NOT_SYNCHRONOUS: {
    message: 'Window setup must be synchronous. Start async work with createKeyed or createLatest.',
    fix: 'Return nothing from setup and start async work with createKeyed or createLatest.',
  },
  FOREIGN_CONTRACT: {
    message: ({plugin, contract}: {plugin: string; contract: string}) =>
      `${plugin} provides only its own contracts, not "${contract}"`,
    fix: 'Provide only contracts whose id starts with your plugin id.',
  },
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
  OUTSIDE_CONTRIBUTION: {
    message: 'usePlugin must run inside a plugin contribution',
    fix: 'Call usePlugin from a component your plugin contributes, or from its setup.',
  },
  OUTSIDE_PANEL: {
    message: 'usePanel must run inside a panel render',
    fix: 'Call usePanel from the component a panel contribution renders.',
  },
  PORTAL_NOT_PLACED: {
    message: ({event}: {event: string}) => `a contribution sent ${event} and no <ConcivWidget/> above it placed it`,
    fix: 'Render the element inside a <ConcivWidget/>.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'widget-plugin': typeof widgetPluginErrors
  }
}
