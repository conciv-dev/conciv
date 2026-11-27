import {defineErrorCatalog, type ErrorCatalogMap} from 'evlog'

export const simulationErrorEntries = {
  ROLE_MISMATCH: {
    status: 400,
    message: ({expected, actual}: {expected: string; actual: string}) =>
      `Expected simulation endpoint role ${expected}, received ${actual}`,
    why: 'the client dialed the endpoint of the other role',
    fix: "dial the endpoint the engine's manifest lists for that role",
  },
  UNSUPPORTED_PROTOCOL: {
    status: 400,
    message: 'No mutually supported simulation protocol version',
    why: 'the client offers no version this endpoint speaks',
    fix: 'update the driver or the engine so both speak the same protocol version',
  },
  MISSING_CAPABILITY: {
    status: 400,
    message: ({missing}: {missing: readonly string[]}) =>
      `Simulation endpoint is missing required capabilities: ${missing.join(', ')}`,
    why: 'the endpoint does not install every capability the client requires',
    fix: 'require only the capabilities the endpoint advertises, or start an endpoint that has them',
  },
  INVOCATION_NOT_FOUND: {
    status: 404,
    message: ({id}: {id: string}) => `Simulated provider invocation not found or already finished: ${id}`,
    why: 'the invocation finished, was disconnected, or never existed',
    fix: 'list the pending invocations and answer one of those',
  },
  TOOL_INVOCATION_NOT_FOUND: {
    status: 404,
    message: ({id}: {id: string}) => `Simulated tool invocation not found or already finished: ${id}`,
    why: 'the tool invocation finished, failed, or never existed',
    fix: 'answer a tool invocation the register stream announced and has not ended',
  },
  TOOL_CONTROLLER: {
    status: 409,
    message: 'another controller owns the simulated tools',
    why: 'the call came from a connection that does not own the simulated tools',
    fix: 'register the tools from this connection first, or call from the connection that did',
  },
  UI_ACTION_FAILED: {
    status: 422,
    message: 'the widget could not do that ui action',
    why: 'the widget refused or could not complete the action',
    fix: "read the message and the widget's state, then try an action the widget supports",
  },
  QUEUE_FULL: {
    status: 429,
    message: 'Simulation control queue is full',
    why: 'too many control messages are waiting on this connection',
    fix: 'wait for the earlier calls to answer before sending more',
  },
  CONTROLLER_DISCONNECTED: {
    status: 503,
    message: 'the simulated model controller disconnected',
    why: 'the controller connection closed before it attached',
    fix: 'connect the controller again',
  },
  NO_SUCH_NODE: {
    status: 404,
    message: ({role, label}: {role: string; label: string}) => `the widget shows no ${role} named ${label}`,
    why: 'the semantic snapshot has no node with that role and label',
    fix: 'take a snapshot and pick a role and label it lists',
  },
  SCRIPTED_SESSION_ID: {
    status: 400,
    message: ({id}: {id: string}) =>
      `the scripted session id ${id} is not a harness session id: use letters, digits, _ and -`,
    why: 'a scripted session id must be a valid harness session id',
    fix: 'rename the scripted session with letters, digits, _ and -',
  },
  TOOL_CALL_INPUT: {
    status: 400,
    message: ({id}: {id: string}) => `the simulated tool call ${id} has input that is not a JSON object`,
    why: 'the controller streamed tool call arguments that do not parse to a JSON object',
    fix: 'stream the tool call arguments as one JSON object',
  },
  TOOL_CALL_NOT_STARTED: {
    status: 400,
    message: ({index}: {index: number}) => `the simulated tool call at index ${index} was never started`,
    why: 'the controller streamed arguments for a tool call it did not start',
    fix: 'start the tool call before streaming its arguments',
  },
  HARNESS_REFUSED: {
    status: 409,
    message: 'the simulated harness refused the run',
    why: 'the simulation was set to refuse every run of this harness',
    fix: 'read the message for why the simulation refuses it',
  },
  NO_SCRIPTED_REPLY: {
    status: 500,
    message: ({count}: {count: number}) => `the scripted harness has no reply for request ${count}`,
    why: 'the test scripted fewer replies than the agent made requests',
    fix: 'script one reply for every request the test makes',
  },
  OUTSIDE_SIMULATION: {
    status: 500,
    message: ({id}: {id: string}) => `the scripted harness ${id} answers only inside the simulation`,
    why: 'a scripted harness was asked to run without the simulation switched on',
    fix: 'start the engine with CONCIV_SIMULATE set',
  },
  LISTEN_FAILED: {
    status: 500,
    message: ({label, href}: {label: string; href: string}) => `${label} could not listen on ${href}`,
    why: 'the endpoint could not bind its port',
    fix: 'free the port, or set another endpoint in the manifest',
  },
  DRIVER_UNREACHABLE: {
    status: 503,
    message: ({url}: {url: string}) => `the driver could not connect to ${url}`,
    why: 'nothing answered on the simulation endpoint',
    fix: 'start the engine with the simulation on, and dial the endpoint its manifest lists',
  },
  UI_ENDPOINT_UNREACHABLE: {
    status: 503,
    message: ({endpoint}: {endpoint: string}) => `the driver could not reach the engine's ui endpoint at ${endpoint}`,
    why: 'the engine is not listening on its ui endpoint',
    fix: 'start the engine with CONCIV_DRIVE set, and dial the ui endpoint its manifest lists',
  },
} as const satisfies ErrorCatalogMap

export const simulationErrors = defineErrorCatalog('simulation', simulationErrorEntries)

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    simulation: typeof simulationErrors
  }
}
