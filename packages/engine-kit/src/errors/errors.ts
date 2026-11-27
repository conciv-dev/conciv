import {defineErrorCatalog} from 'evlog'

export const engineKitErrors = defineErrorCatalog('engine-kit', {
  PROJECT_FILE_OUTSIDE: {
    message: ({path, root}: {path: string; root: string}) =>
      `the project file ${path} resolves outside the project root ${root}`,
    fix: 'Give write a path inside the project.',
  },
  RUN_FAILED: {message: ({text}: {text: string}) => text},
  TOOL_ANSWERED: {
    message: ({name, output}: {name: string; output: string}) =>
      `the tool ${name} answered instead of failing: ${output}`,
  },
  RPC_ANSWERED: {
    message: ({method, output}: {method: string; output: string}) =>
      `the rpc ${method} answered instead of failing: ${output}`,
  },
  ENGINE_STOPPED_BEFORE_EVENT: {
    message: ({type}: {type: string}) => `the engine stopped before a ${type} event arrived`,
  },
  OPENING_EVENT_UNWAITABLE: {
    message: ({event}: {event: string}) =>
      `${event} cannot be waited for: the engine sends it once, as the first frame of each event subscription, and event() resolves once that frame has come`,
  },
  NOT_DRIVEN: {message: 'this engine is not driven: make it with simulation: true'},
  HARNESSES_AND_HARNESS: {message: 'harnesses and harness cannot be given together: harnesses are scripted'},
  HARNESSES_EMPTY: {message: 'harnesses is empty: give at least the engine harness'},
  HARNESS_ID_REPEATED: {
    message: ({id}: {id: string}) => `harnesses lists the id ${id} twice: each harness needs its own id`,
  },
  HARNESS_NOT_LISTED: {
    message: ({id, ids}: {id: string; ids: string}) =>
      `the config names the harness ${id}, but the engine's harnesses are ${ids}`,
  },
  KIT_OWNED_CONFIG: {
    message: ({owned}: {owned: string}) =>
      `the kit sets ${owned} itself, inside the engine's temp root: leave ${owned} out of the config`,
  },
  DIRECTORY_MISSING: {message: ({folder}: {folder: string}) => `the directory ${folder} is not an existing folder`},
  NO_FREE_PORT: {
    message: ({first, last, reason}: {first: number; last: number; reason: string}) =>
      `no free port between ${first} and ${last}: ${reason}`,
  },
  TOKEN_WITHOUT_CONNECT: {
    message: "start gives a token without port: 'connect': the token is the connect port's pairing token",
  },
  TWO_PORTS: {
    message: ({port}: {port: number}) =>
      `the config gives port ${port} and start gives port: 'connect': give the engine one port`,
  },
  WRITE_INTO_FIXTURE: {
    message: ({fixture}: {fixture: string}) =>
      `the engine runs on the fixture folder ${fixture}: put its files in the fixture, not through write`,
  },
  GIT_ON_FIXTURE: {
    message: ({fixture}: {fixture: string}) =>
      `git: true needs the engine's own temp project, not the fixture folder ${fixture}`,
  },
  ENGINE_STOPPED: {message: 'the engine is stopped: it cannot restart'},
  NO_GIT_PROJECT: {message: 'this engine has no git project: make it with git: true'},
  CLOCK_NEVER_SETTLED: {message: 'the engine clock was advanced for 15s and the awaited call never settled'},
  REAL_CLOCK: {message: "this engine runs on the real clock: make it with clock: 'test'"},
  PLUGIN_NOT_INSTALLED: {
    message: ({name}: {name: string}) => `the plugin ${name} is not installed in the package under test`,
    fix: 'Add the plugin to the devDependencies of the package under test.',
  },
  NO_ENGINE: {message: ({engineId}: {engineId: string}) => `no engine ${engineId}: it was never made or has stopped`},
  NO_SESSION: {
    message: ({engineId, sessionId}: {engineId: string; sessionId: string}) =>
      `engine ${engineId} has no session ${sessionId}`,
  },
  NO_GATE: {
    message: ({engineId, gateId}: {engineId: string; gateId: string}) => `engine ${engineId} has no gate ${gateId}`,
  },
  NO_EVENT_WAIT: {
    message: ({engineId, waitId}: {engineId: string; waitId: string}) =>
      `engine ${engineId} has no event wait ${waitId}`,
  },
  TOOL_FAILED: {message: ({text}: {text: string}) => text},
  TOOL_REPLY_TRUNCATED: {
    message: ({name, reason}: {name: string; reason: string}) =>
      `the reply for tool "${name}" was truncated (${reason})`,
  },
  TOOL_NAME_NOT_IDENTIFIER: {
    message: ({name}: {name: string}) =>
      `the tool name "${name}" is not a plain identifier (letters, digits and _, not starting with a digit), so code mode cannot call it as external_${name}`,
  },
  TOOL_NO_REPLY: {
    message: ({name, ms}: {name: string; ms: number}) => `the tool ${name} gave no reply within ${ms}ms`,
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'engine-kit': typeof engineKitErrors
  }
}
