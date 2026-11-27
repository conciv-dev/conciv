import {defineErrorCatalog} from 'evlog'

export const testKitErrors = defineErrorCatalog('test-kit', {
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
  UNANSWERED: {
    message: ({procedures}: {procedures: string}) =>
      `the fake engine was asked for what no test gave it: ${procedures}`,
    fix: 'Give the fake engine a handler for each procedure the test reaches.',
  },
  NOT_TRUSTED: {
    status: 401,
    message: 'the engine did not trust the test browser',
    fix: 'Start the engine with the token the test app binds to.',
  },
  BUNDLE_FILE_MISSING: {
    status: 404,
    message: ({id, file}: {id: string; file: string}) => `the build of the plugin ${id} has no file ${file}`,
    fix: 'Rebuild the plugin so its dist holds every chunk.',
  },
  BUNDLE_MANIFEST_MISSING: {
    status: 404,
    message: ({id}: {id: string}) => `the build of the plugin ${id} has no chunk manifest`,
    fix: 'Rebuild the plugin with the conciv plugin build.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'test-kit': typeof testKitErrors
  }
}
