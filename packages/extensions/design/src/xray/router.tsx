import {createRouter, parseSearchWith, stringifySearchWith} from '@tanstack/solid-router'
import {rootRoute} from './routes/__root.js'
import {indexRoute} from './routes/index.js'

const routeTree = rootRoute.addChildren([indexRoute])

function pageUrl(input: {url: URL; path: string}): URL {
  return new URL(`${input.path}${input.url.search}${input.url.hash}`, input.url.origin)
}

export function createXrayRouter() {
  const page = window.location.pathname
  return createRouter({
    routeTree,
    scrollRestoration: false,
    parseSearch: parseSearchWith((value) => value),
    stringifySearch: stringifySearchWith(JSON.stringify),
    rewrite: {
      input: ({url}) => pageUrl({url, path: '/'}),
      output: ({url}) => pageUrl({url, path: page}),
    },
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createXrayRouter>
  }
}
