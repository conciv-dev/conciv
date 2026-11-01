import {createRouter, parseSearchWith, stringifySearchWith} from '@tanstack/solid-router'
import {pagePrefix} from './data.js'
import {captureRoute} from './routes/capture.js'
import {indexRoute} from './routes/index.js'
import {layoutRoute} from './routes/layout.js'
import {listRoute} from './routes/list.js'
import {rootRoute} from './routes/__root.js'

const routeTree = rootRoute.addChildren([layoutRoute.addChildren([indexRoute, listRoute, captureRoute])])

function withPath(input: {url: URL; path: string}): URL {
  return new URL(`${input.path}${input.url.search}${input.url.hash}`, input.url.origin)
}

function innerPath(input: {path: string; prefix: string}): string {
  const rest = input.path.startsWith(input.prefix) ? input.path.slice(input.prefix.length) : input.path
  return rest === '' ? '/' : rest
}

export function createXrayRouter() {
  const prefix = pagePrefix()
  return createRouter({
    routeTree,
    scrollRestoration: false,
    parseSearch: parseSearchWith((value) => value),
    stringifySearch: stringifySearchWith(JSON.stringify),
    rewrite: {
      input: ({url}) => withPath({url, path: innerPath({path: url.pathname, prefix})}),
      output: ({url}) => withPath({url, path: `${prefix}${url.pathname}`}),
    },
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createXrayRouter>
  }
}
