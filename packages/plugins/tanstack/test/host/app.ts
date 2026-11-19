import {createElement, type ReactElement, StrictMode, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {QueryClient, QueryClientProvider, useQuery} from '@tanstack/react-query'
import {createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider} from '@tanstack/react-router'

const queryClient = new QueryClient()

const fetches = {count: 0}

const todoFetches = {list: 0, page: 0}

const userFetches = {first: 0, second: 0}

const slowLoads = {count: 0, release: () => {}}

function RootLayout() {
  return createElement(
    'div',
    null,
    createElement(
      'nav',
      null,
      createElement(Link, {to: '/'}, 'Home'),
      createElement(Link, {to: '/about'}, 'About'),
      createElement(Link, {to: '/boom'}, 'Boom'),
      createElement(Link, {to: '/', hash: 'access_token=secret-hash-value'}, 'Signed in'),
    ),
    createElement('main', null, createElement(Outlet)),
  )
}

const rootRoute = createRootRoute({component: RootLayout})

function HomePage() {
  return createElement('h1', null, 'TanStack inspection home')
}

const indexRoute = createRoute({getParentRoute: () => rootRoute, path: '/', component: HomePage})

function AboutPage() {
  const demo = useQuery({
    queryKey: ['spike', 'demo'],
    queryFn: async () => {
      fetches.count += 1
      return {fetches: fetches.count}
    },
  })
  const todos = useQuery({
    queryKey: ['todos'],
    queryFn: async () => {
      todoFetches.list += 1
      return {fetches: todoFetches.list}
    },
  })
  const todoPage = useQuery({
    queryKey: ['todos', {page: 1}],
    queryFn: async () => {
      todoFetches.page += 1
      return {fetches: todoFetches.page}
    },
  })
  const firstUser = useQuery({
    queryKey: ['user', {token: 'query-key-secret-value'}],
    queryFn: async () => {
      userFetches.first += 1
      return {fetches: userFetches.first}
    },
  })
  const secondUser = useQuery({
    queryKey: ['user', {token: 'second-key-secret-value'}],
    queryFn: async () => {
      userFetches.second += 1
      return {fetches: userFetches.second}
    },
  })
  return createElement(
    'section',
    null,
    createElement('h1', null, 'About this app'),
    createElement('p', null, `Fetches: ${demo.data?.fetches ?? 0}`),
    createElement('p', null, `Todo list runs: ${todos.data?.fetches ?? 0}`),
    createElement('p', null, `Todo page runs: ${todoPage.data?.fetches ?? 0}`),
    createElement('p', null, `First user runs: ${firstUser.data?.fetches ?? 0}`),
    createElement('p', null, `Second user runs: ${secondUser.data?.fetches ?? 0}`),
  )
}

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  loader: async () => ({
    server: {greeting: 'hello'},
    local: {n: 42, tags: ['a', 'b']},
    deep: {a: {b: {c: {d: {e: 'too-deep'}}}}},
  }),
  component: AboutPage,
})

function BoomPage() {
  const trigger = () => {
    throw new Error('boom-from-event-handler')
  }
  const flood = () => {
    Array.from({length: 50}, (_, index) => Promise.reject(new Error(`long-error-${index} ${'x'.repeat(9_000)}`)))
  }
  return createElement(
    'div',
    null,
    createElement('button', {type: 'button', onClick: trigger}, 'Trigger runtime error'),
    createElement('button', {type: 'button', onClick: flood}, 'Reject fifty long promises'),
  )
}

const boomRoute = createRoute({getParentRoute: () => rootRoute, path: '/boom', component: BoomPage})

function ResetPage() {
  return createElement('h1', null, 'Reset password')
}

const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset/$token',
  loaderDeps: ({search}) => search,
  component: ResetPage,
})

function SlowPage(): ReactElement {
  const data = slowRoute.useLoaderData()
  const match = slowRoute.useMatch()
  const reload = () => {
    router.invalidate().catch((error: unknown) => console.error(error))
  }
  return createElement(
    'section',
    null,
    createElement('h1', null, 'Slow data'),
    createElement('p', null, `Loads: ${data.loads}`),
    match.isFetching ? createElement('p', null, 'Reloading') : null,
    createElement('button', {type: 'button', onClick: reload}, 'Reload slow data'),
    createElement('button', {type: 'button', onClick: () => slowLoads.release()}, 'Release loader'),
  )
}

const slowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/slow',
  loader: () => {
    slowLoads.count += 1
    const loads = slowLoads.count
    if (loads === 1) return {loads}
    return new Promise<{loads: number}>((resolve) => {
      slowLoads.release = () => resolve({loads})
    })
  },
  component: SlowPage,
})

const refusingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/refusing',
  search: {
    middlewares: [
      ({search, next}) => {
        const result = next(search)
        if (Object.keys(result).includes('refuse')) throw new Error(`refused ${'x'.repeat(5000)}`)
        return result
      },
    ],
  },
})

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, aboutRoute, boomRoute, resetRoute, slowRoute, refusingRoute]),
})

const app = createElement(
  StrictMode,
  null,
  createElement(QueryClientProvider, {client: queryClient}, createElement(RouterProvider, {router})),
)

function LateHost() {
  const [mounted, setMounted] = useState(false)
  if (mounted) return app
  return createElement('button', {type: 'button', onClick: () => setMounted(true)}, 'Mount router')
}

const rootElement = document.getElementById('root')
if (rootElement)
  createRoot(rootElement).render(new URLSearchParams(location.search).has('late') ? createElement(LateHost) : app)
