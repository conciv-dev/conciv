import {defineErrorCatalog} from 'evlog'

export const tanstackErrors = defineErrorCatalog('tanstack', {
  INVALID_OPTIONS: {
    status: 400,
    message: ({detail}: {detail: string}) => `Invalid tanstack plugin options: ${detail}`,
    fix: 'Fix the tanstack options in the conciv config.',
  },
  RPC_REGISTER_FAILED: {
    message: ({detail}: {detail: string}) => `The tanstack rpc could not be registered: ${detail}`,
  },
  BUNDLER_UNAVAILABLE: {
    message: 'bundler bridge unavailable',
    why: 'The dev server has not connected its bundler bridge to the engine.',
    fix: 'Start the app dev server with the conciv plugin, then call the tool again.',
  },
  MANIFEST_UNREADABLE: {
    message: ({detail}: {detail: string}) => detail,
    why: 'The engine could not read src/routeTree.gen.ts.',
    fix: 'Run the dev server once so TanStack Router writes src/routeTree.gen.ts.',
  },
  OPERATION_UNKNOWN: {
    message: ({name}: {name: string}) => `no tanstack operation named ${name}`,
  },
  PAGE_PENDING: {
    message: 'The page plugin is still starting in this tab; no action ran.',
    fix: 'Call tanstack.tabs.list({}) once it finishes starting, then retry.',
  },
  PAGE_DISABLED: {
    message: 'The page plugin is disabled in this tab, so TanStack cannot read the React tree; no action ran.',
    fix: 'Ask the user to enable the page plugin, then call tanstack.tabs.list({}).',
  },
  PAGE_FAILED: {
    message: 'The page plugin failed to start in this tab, so TanStack cannot read the React tree; no action ran.',
    fix: 'Ask the user to reload the page, then call tanstack.tabs.list({}).',
  },
  ROUTER_NOT_FOUND: {message: 'TanStack router not found on page'},
  QUERY_CLIENT_NOT_FOUND: {message: 'TanStack QueryClient not found on page'},
  RESULT_TOO_LARGE: {
    status: 413,
    message: 'TanStack result exceeds 512000 JSON characters.',
    fix: 'Ask for one route with loader_data, or a single query key, instead of the whole cache. Repeating the same request will not reduce its output.',
  },
  INVALID_ACTION: {
    status: 400,
    message: ({detail}: {detail: string}) => detail,
  },
  HANDLER_FAILED: {
    message: ({detail}: {detail: string}) => detail,
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    tanstack: typeof tanstackErrors
  }
}
