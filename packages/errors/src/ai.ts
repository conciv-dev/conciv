import {defineErrorCatalog} from 'evlog'

export const SECRET_REFUSAL = 'looks like a secret, so code mode refuses to run it'

export const aiErrors = defineErrorCatalog('ai', {
  APPROVAL_DENIED: {
    status: 403,
    message: ({name}: {name: string}) =>
      `The user denied running tool "${name}". Do not retry it; continue without it.`,
    why: 'The user answered the permission card with a refusal.',
  },
  TOOL_FAILED: {
    message: 'The tool failed',
  },
  TOOL_STOPPED: {
    message: ({name}: {name: string}) =>
      `The call to tool "${name}" was stopped before it finished: the program or the agent that made it stopped waiting for it.`,
    why: 'The caller went away first, for example an outside agent whose request timed out while the call waited for approval.',
  },
  NO_TAB: {
    status: 409,
    message: 'pass tab to execute_typescript; list_tabs lists the open tabs',
    why: 'An outside run has no tab, and this capability works on the page of one.',
    fix: 'Call list_tabs, then pass the id of an open tab as tab to execute_typescript.',
  },
  SECRET_PARAMETER: {
    status: 400,
    message: ({tool, parameter}: {tool: string; parameter: string}) =>
      `"${tool}" takes "${parameter}", which ${SECRET_REFUSAL}`,
    why: 'A value code mode would pass to this tool looks like a key or a token.',
    fix: 'Call the tool directly instead of from code mode.',
  },
  SECRET_REFUSED: {
    status: 400,
    message: `code mode refused to run a value that ${SECRET_REFUSAL}`,
    why: 'A value the code would pass to a tool looks like a key or a token.',
    fix: 'Call the tool directly instead of from code mode.',
  },
  SCHEMA_INVALID: {
    status: 400,
    message: ({failure, reason}: {failure: string; reason: string}) => `${failure}: ${reason}`,
  },
  CODE_MODE_UNAVAILABLE: {
    message: 'the code mode tool has no execute',
  },
  UI_TOOL_UNAVAILABLE: {
    message: 'conciv_ui: server tool has no execute',
  },
  TOOL_SERVER_NO_PORT: {
    message: 'the tool bridge has no port',
  },
  RUN_NOT_STORED: {
    message: ({runId}: {runId: string}) => `run ${runId} was not stored`,
  },
  RUN_NOT_IN_SESSION: {
    status: 404,
    message: ({runId, sessionId}: {runId: string; sessionId: string}) =>
      `run ${runId} is not a run of session ${sessionId}`,
  },
  ATTACHMENT_URI_UNSUPPORTED: {
    status: 400,
    message: ({uri}: {uri: string}) => `Unsupported attachment URI: ${uri}`,
    fix: 'Attach the file again; only base64 data URIs are accepted.',
  },
  ATTACHMENT_INVALID: {
    status: 400,
    message: ({mimeType}: {mimeType: string}) => `Invalid attachment data: ${mimeType}`,
    fix: 'Attach an image or a document the model can read.',
  },
  HARNESS_LOGGED_OUT: {
    status: 401,
    message: 'The agent is not logged in',
    fix: 'Log in to the agent CLI, then send the message again.',
  },
  MESSAGE_EMPTY: {
    status: 400,
    message: 'the message is empty',
    fix: 'Type a message or attach a file before sending.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    ai: typeof aiErrors
  }
}
