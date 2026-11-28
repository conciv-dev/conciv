import {defineErrorCatalog, type ErrorCatalogMap} from 'evlog'

export const engineErrorEntries = {
  BAD_REQUEST: {
    status: 400,
    message: 'the request is malformed',
    why: 'the engine could not read what the caller sent',
    fix: 'check the request against the engine contract and send it again',
  },
  UNAUTHORIZED: {
    status: 401,
    message: 'this connection is not trusted',
    why: 'the caller presented no engine token, or one the engine no longer trusts',
    fix: 'sign in again from the widget, or pass the engine token',
  },
  FORBIDDEN: {
    status: 403,
    message: 'only the engine token may issue a login code',
    why: 'the call came from a caller that does not hold the engine token',
    fix: 'run the command from the machine that started the engine',
  },
  NOT_FOUND: {
    status: 404,
    message: 'session not found',
    why: 'no session with that id exists on this engine',
    fix: 'list the sessions and use an id from that list',
  },
  INVALID_ARGS: {
    status: 400,
    message: 'the tool rejected the arguments',
    why: "the input does not match the tool's input schema",
    fix: "read the tool's signature in the catalog and send input that matches it",
  },
  PLUGIN_RPC: {
    status: 400,
    message: 'the plugin rpc call failed',
    why: 'the plugin answered the call with one of its own declared errors',
    fix: "read the plugin's error type and message and change the call to match",
  },
  APPROVAL_DENIED: {
    status: 403,
    message: 'the call was not approved',
    why: 'the call needs an approval that was refused or that this caller cannot give',
    fix: 'approve the call in the tab, or make it from the tab',
  },
  UNKNOWN_TOOL: {
    status: 404,
    message: 'no registered tool answers to that name',
    why: 'no plugin or engine capability registers a tool with that name',
    fix: 'list the catalog and call a tool by a name it shows',
  },
  UNKNOWN_MODEL: {
    status: 404,
    message: 'unknown or disabled model',
    why: 'the harness does not offer that model, or offers it disabled',
    fix: 'pick a model from the session model list',
  },
  UNKNOWN_HARNESS: {
    status: 404,
    message: 'that harness is not available',
    why: 'no harness with that id is configured on this engine',
    fix: 'pick a harness from the harness list',
  },
  UNKNOWN_REQUEST: {
    status: 404,
    message: 'no pending approval',
    why: 'the request was already answered, or it ended with its run',
    fix: 'refresh the session and answer a request that is still pending',
  },
  PLUGIN_NOT_FOUND: {
    status: 404,
    message: ({pluginId}: {pluginId: string}) => `No active plugin with a ./plugin-experimental bundle: ${pluginId}`,
    why: 'the plugin is not installed, failed to start, or ships no ./plugin-experimental bundle',
    fix: 'list the plugins and check that the plugin is active',
  },
  PLUGIN_CHUNK_NOT_FOUND: {
    status: 404,
    message: ({pluginId, file}: {pluginId: string; file: string}) =>
      `No chunk ${file} in the current build of the plugin ${pluginId}`,
    why: 'the plugin was rebuilt and its chunks were renamed',
    fix: "reload the plugin's bundle and ask for a chunk it lists",
  },
  PTY_NOT_FOUND: {
    status: 404,
    message: 'no terminal with that id',
    why: 'the terminal ended, or it belongs to another caller',
    fix: 'open a new terminal for the session',
  },
  SESSION_RUNNING: {
    status: 409,
    message: 'the session has a run in progress',
    why: 'the session cannot change while a run is in progress',
    fix: 'stop the run, or wait for it to end, and try again',
  },
  BUSY: {
    status: 409,
    message: 'the terminal CLI is busy',
    why: 'the CLI in the terminal is still working',
    fix: 'wait for the CLI to finish, or interrupt it, and try again',
  },
  NO_TTY: {
    status: 409,
    message: "the session's harness has no terminal command",
    why: "the session's harness cannot run in a terminal",
    fix: 'switch the session to a harness that has a terminal',
  },
  NO_CODE_MODE: {
    status: 409,
    message: 'code mode is unavailable on this engine',
    why: 'this engine has no code-mode sandbox for the caller',
    fix: 'call the tools directly, or start the engine with code mode on',
  },
  UNSUPPORTED_EFFORT: {
    status: 422,
    message: 'the session model does not support this effort',
    why: "the effort is not one of the session model's efforts",
    fix: 'pick an effort the session model lists',
  },
  HANDLER_ERROR: {
    status: 500,
    message: 'the tool failed to run',
    why: 'the tool threw while it ran',
    fix: "read the engine's logs for the tool's error",
  },
  PLUGIN_RPC_INTERNAL: {
    status: 500,
    message: 'the plugin rpc call failed inside the plugin',
    why: 'the plugin failed while it answered, or answered with output its contract refuses',
    fix: "read the engine's logs for the plugin's error",
  },
  SESSION_VANISHED: {
    status: 500,
    message: ({sessionId}: {sessionId: string}) => `the session row ${sessionId} vanished right after it was created`,
    why: 'the new session row was removed before the engine read it back',
    fix: "read the engine's logs, and report it if it happens again",
  },
  UNAVAILABLE: {
    status: 503,
    message: 'the tab is not open on this engine',
    why: 'the tab closed, or it is open on another engine',
    fix: 'open the tab on this engine and try again',
  },
  SLOW_CONSUMER: {
    status: 503,
    message: 'the reader fell too far behind the terminal output',
    why: 'the reader did not keep up with the output, so the engine ended the stream',
    fix: 'read the stream again from its last cursor',
  },
  RESERVED_RPC_ERROR: {
    status: 500,
    message: ({name}: {name: string}) => `RPC error names starting with "rpc." are reserved: ${name}`,
    why: 'a plugin rpc definition declares an error in the reserved rpc. namespace',
    fix: 'rename the error so it does not start with rpc.',
  },
  DUPLICATE_LATEST_EVENT: {
    status: 500,
    message: ({type}: {type: string}) => `Duplicate latest event definition for ${type}`,
    why: 'two different event definitions share one type and version',
    fix: 'give each event definition its own type, or bump its durable version',
  },
  DUPLICATE_DURABLE_EVENT: {
    status: 500,
    message: ({key}: {key: string}) => `Duplicate durable event definition for ${key}`,
    why: 'two durable event definitions share one type and version',
    fix: 'bump the durable version of one of them',
  },
  BUNDLER_ID_MISSING: {
    status: 500,
    message: 'bundler bridge: id is required',
    why: 'a bundler bridge was defined without an id',
    fix: 'give the bundler bridge an id',
  },
  CONFLICT: {
    status: 409,
    message: 'the resource already exists',
    why: 'a resource with that id is already stored',
  },
  INTEGRATION_NOT_FOUND: {
    status: 404,
    message: 'integration not found',
    why: 'no plugin declares an integration with that id',
    fix: 'list the integrations and use an id from that list',
  },
  INTEGRATION_METHOD_NOT_FOUND: {
    status: 404,
    message: 'integration method not found',
    why: 'the integration declares no method with that id',
  },
  INTEGRATION_ATTEMPT_NOT_FOUND: {
    status: 404,
    message: 'integration attempt not found',
    why: 'the attempt finished, expired or was cancelled',
  },
  INTEGRATION_POLICY: {
    status: 400,
    message: 'connecting this integration is not allowed',
    why: 'an integration.connect policy denies it',
  },
  INTEGRATION_AUTHORIZATION: {
    status: 400,
    message: 'Authentication failed',
    why: 'the integration refused the sign-in or could not finish it',
  },
  INTEGRATION_CODE_REQUIRED: {
    status: 400,
    message: 'Authorization code is required',
  },
} as const satisfies ErrorCatalogMap

export const engineErrors = defineErrorCatalog('engine', engineErrorEntries)

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    engine: typeof engineErrors
  }
}
