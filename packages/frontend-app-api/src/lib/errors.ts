import {defineErrorCatalog} from 'evlog'

export const libErrors = defineErrorCatalog('frontend-app-api.lib', {
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
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'frontend-app-api.lib': typeof libErrors
  }
}
