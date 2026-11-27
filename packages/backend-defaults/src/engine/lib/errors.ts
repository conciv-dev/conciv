import {defineErrorCatalog} from 'evlog'

export const engineErrors = defineErrorCatalog('backend.engine', {
  SESSION_ID_INVALID: {
    message: ({declared}: {declared: string}) =>
      `the configured conciv session id "${declared}" is not a conciv session id (ses_...)`,
    fix: 'Set the session id to a conciv session id that starts with ses_, or leave it out.',
  },
  HARNESS_SESSION_ID_INVALID: {
    message: ({declared}: {declared: string}) =>
      `the configured harness session id "${declared}" is not a harness session id (up to 128 characters of A-Z, a-z, 0-9, "_" and "-")`,
    fix: 'Set the harness session id to the id the agent CLI gave the session, or leave it out.',
  },
  SETTINGS_NAMESPACE_REFUSED: {
    status: 400,
    message: ({namespace, reason}: {namespace: string; reason: string}) =>
      `conciv: the settings namespace "${namespace}" is refused: ${reason}`,
  },
  NATIVE_ROW_VANISHED: {
    message: ({nativeId}: {nativeId: string}) =>
      `session row for native session "${nativeId}" vanished while claiming it`,
  },
  LISTED_ROW_VANISHED: {
    message: ({sessionId}: {sessionId: string}) => `session row "${sessionId}" vanished while listing native sessions`,
  },
  HARNESS_UNKNOWN: {
    message: ({id, known}: {id: string; known: string}) =>
      `conciv: unknown harness "${id}". Known harnesses: ${known}.`,
    fix: 'Use one of the known harness ids.',
  },
  ACCESS_TOKEN_INVALID: {
    message: 'conciv: accessToken must be a UUID pairing token',
    fix: 'Pass the pairing token the engine printed, or leave the access token out.',
  },
  CAPABILITY_NAME_TAKEN: {
    message: ({name, existing, source}: {name: string; existing: string; source: string}) =>
      `capability name "${name}" is declared by both ${existing} and ${source}`,
    fix: 'Rename the capability in one of the two plugins.',
  },
  ENGINE_STOPPED: {
    message: 'conciv: the engine stopped',
  },
  HARNESS_SESSION_NOT_ENSURED: {
    message: ({harnessSessionId}: {harnessSessionId: string}) =>
      `conciv: the configured harness session "${harnessSessionId}" could not be ensured`,
  },
  SESSION_NOT_ENSURED: {
    message: ({sessionId}: {sessionId: string}) =>
      `conciv: the configured conciv session "${sessionId}" could not be ensured`,
  },
  HOME_UNREACHABLE: {
    message: ({home}: {home: string}) => `conciv: the home ${home} could not be opened`,
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'backend.engine': typeof engineErrors
  }
}
