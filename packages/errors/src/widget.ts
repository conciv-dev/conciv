import {defineErrorCatalog} from 'evlog'

export const widgetErrors = defineErrorCatalog('widget', {
  LAYERS_OUTSIDE_PROVIDER: {
    message: 'useLayers called outside the layers provider',
    fix: 'Call useLayers from a component rendered inside the layers provider.',
  },
  NO_WINDOW: {
    message: 'The document has no window to build a stylesheet in',
    why: 'The document is detached from any window, so it cannot hold styles.',
  },
  OPAQUE_WRONG_TYPE: {
    message: ({type, received}: {type: string; received: string}) =>
      `Invalid opaque type, expected '${type}', but got '${received}'`,
    fix: 'Pass a value made by the matching create function.',
  },
  OPAQUE_WRONG_VERSION: {
    message: ({received, expected}: {received: string; expected: string}) =>
      `Invalid opaque type instance, got version ${received}, expected ${expected}`,
    fix: 'Rebuild the plugin against the conciv version this app runs.',
  },
  OUTSIDE_PROVIDER: {
    message: ({hook, provider}: {hook: string; provider: string}) => `${hook} called outside ${provider}`,
    fix: 'Call it from a component rendered inside that provider.',
  },
  NO_LIVE_CHAT: {
    status: 404,
    message: ({sessionId}: {sessionId: string}) => `no live chat for session ${sessionId}`,
    why: 'The chat for this session was closed before it was read.',
  },
  CANNOT_BIND: {
    message: 'this host cannot bind the widget to an engine',
    fix: 'Give the host platform a connect function.',
  },
  ALREADY_BOUND: {
    status: 409,
    message: 'conciv rpc client already bound',
    why: 'The widget is already connected to an engine.',
  },
  DRAFT_NOT_KEPT: {
    message: ({change}: {change: string}) => `neither this browser nor the engine holds the ${change} draft`,
    why: 'The browser storage and the engine both refused the draft.',
    fix: 'Copy the draft text somewhere safe, then reconnect and try again.',
  },
  RUN_FAILED: {
    message: 'The run failed',
  },
  SEND_REFUSED: {
    status: 409,
    message: 'The message was not sent',
  },
  SEND_SKIPPED: {
    message: 'The message was not sent',
    why: 'The send was withdrawn, empty, or waited on another step.',
  },
  PREVIEW_READ_ONLY: {
    status: 403,
    message: 'the session preview is read-only',
    fix: 'Open the session to write in it.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    widget: typeof widgetErrors
  }
}
