import {defineErrorCatalog} from 'evlog'

const SILENT_HINT =
  'a dev server still starting answers once it is ready; run the command again, or restart the dev server if it stays silent.'

export const cliErrors = defineErrorCatalog('cli', {
  INIT_REFUSED: {status: 409, message: ({reason}: {reason: string}) => reason, fix: 'nothing was written'},
  HUB_REFUSED: {status: 409, message: 'the agent hub refused the change'},
  DATA_NOT_JSON: {
    status: 400,
    message: ({data}: {data: string}) => `--data is not JSON: ${data}`,
    fix: `pass the method's input as JSON, for example --data '{}'`,
  },
  SESSION_ID_INVALID: {
    status: 400,
    message: ({raw}: {raw: string}) => `CONCIV_SESSION_ID is not a conciv session id: "${raw}"`,
    fix: 'Unset it, or set it to the ses_… id the engine handed your terminal.',
  },
  TAB_REPEATED: {
    status: 400,
    message: '--tab was given more than once with different tab ids.',
    fix: 'pass --tab once.',
  },
  NO_ENGINE_STATE: {
    status: 404,
    message: 'no conciv engine state found here or in any parent directory',
    fix: 'run this inside a project that has run the conciv dev server (it writes .conciv/server.json)',
  },
  NO_ENGINE_TOKEN: {
    status: 409,
    message: 'the conciv engine state holds no engine token',
    fix: 'restart the conciv dev server so it rewrites .conciv/server.json',
  },
  NO_TRUSTED_BROWSER: {
    status: 404,
    message: ({id}: {id: string}) => `no trusted browser has the id "${id}"`,
    fix: 'run `conciv auth revoke` without an id to list the trusted browsers',
  },
  NO_ENGINE_ANSWERED: {
    status: 404,
    message: ({silent}: {silent: string}) => `no conciv dev server answered: ${silent}.`,
    fix: SILENT_HINT,
  },
  NO_ENGINE_FOR_TAB: {
    status: 404,
    message: ({home}: {home: string}) =>
      `no conciv dev server is running; start one and open its page (conciv home folder read: ${home}).`,
    fix: 'start the dev server of a project set up with conciv init, open its page, then run the command again.',
  },
  TAB_ON_MANY_ENGINES: {
    status: 409,
    message: ({tab, count, roots}: {tab: string; count: number; roots: string}) =>
      `tab ${tab} is open in ${count} running conciv dev servers: ${roots}.`,
    fix: 'stop all but one of them, or reload the page so only one server holds the tab.',
  },
  TAB_NOT_FOUND: {
    status: 404,
    message: ({tab, silent}: {tab: string; silent: string}) => `cannot find tab ${tab}: ${silent}.`,
    fix: SILENT_HINT,
  },
  TAB_NOT_OPEN: {
    status: 404,
    message: ({tab, count, unanswered}: {tab: string; count: number; unanswered: string}) =>
      `tab ${tab} is not open in any of the ${count} running conciv dev servers${unanswered}.`,
    fix: 'conciv tools tabs lists the open tabs; open the page again if it was closed.',
  },
  OFFLINE: {
    status: 404,
    message: ({host}: {host: string}) => `No conciv dev server on ${host}.`,
    fix: "Start your app (pnpm dev). conciv reads the engine port from .conciv/server.json; CONCIV_PORT=<engine port> overrides it (this is the conciv engine port, not Vite's).",
  },
  RPC_REJECTED: {status: 400, message: 'the conciv engine refused the call'},
  TAB_ON_TWO_ENGINES: {
    status: 409,
    message: ({tab, first, second}: {tab: string; first: string; second: string}) =>
      `tab ${tab} is open on two conciv engines (${first} and ${second}); ask the user to close one of the browser tabs`,
  },
  HUB_TAB_NOT_OPEN: {
    status: 404,
    message: ({tab}: {tab: string}) => `TAB_NOT_OPEN: tab ${tab} is not open; call list_tabs`,
  },
  NO_HANDLER: {status: 500, message: ({route}: {route: string}) => `the route ${route} has no handler`},
  EMPTY_CATALOG: {status: 500, message: 'the registry catalog returned no data'},
  NO_ENGINE_RUNNING: {
    status: 503,
    message: ({home}: {home: string}) =>
      `no conciv dev server is running; start one and open its page (conciv home folder read: ${home})`,
  },
  HOME_UNREADABLE: {
    status: 500,
    message: ({home, reason}: {home: string; reason: string}) =>
      `cannot read the conciv home folder ${home}: ${reason}`,
  },
  CALL_FAILED: {
    status: 502,
    message: ({root, reason, after}: {root: string; reason: string; after: string}) =>
      `the call failed on the conciv engine at ${root} (${reason}); it was not retried, since the block may already have acted on a page; ${after}`,
  },
  TAB_CALL_FAILED: {
    status: 502,
    message: ({tab, root, reason}: {tab: string; root: string; reason: string}) =>
      `the call on tab ${tab} failed on the conciv engine at ${root} (${reason}); it was not retried, since the block may already have acted on a page; the next call looks up the engine holding the tab again`,
  },
  NO_RUNNER: {
    status: 503,
    message: ({silent}: {silent: string}) => `no conciv dev server answered: ${silent}`,
  },
  NO_USABLE_RUNNER: {
    status: 503,
    message: ({named}: {named: string}) => `no conciv dev server this hub can use is running: ${named}`,
  },
  PROBE_FAILED: {status: 503, message: ({text}: {text: string}) => text},
  TAB_PROBES_FAILED: {
    status: 503,
    message: ({tab, failures}: {tab: string; failures: string}) =>
      `cannot tell whether tab ${tab} is open: no engine that answered has it, and ${failures}; nothing ran`,
  },
  NO_INSTALL_COMMAND: {status: 500, message: ({name}: {name: string}) => `nypm planned no command to add ${name}`},
  INSTALL_FAILED: {
    status: 500,
    message: ({command, output}: {command: string; output: string}) => `\`${command}\` failed.\n${output}`,
  },
  EMPTY_DLX_COMMAND: {
    status: 500,
    message: ({line}: {line: string}) => `nypm dlxCommand returned an empty command: ${line}`,
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    cli: typeof cliErrors
  }
}
