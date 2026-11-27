import {defineErrorCatalog} from 'evlog'

export const appErrors = defineErrorCatalog('frontend-defaults.app', {
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
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'frontend-defaults.app': typeof appErrors
  }
}
