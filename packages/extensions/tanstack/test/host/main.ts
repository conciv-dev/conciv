import {createElement, StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {QueryClient, QueryClientProvider, useQuery} from '@tanstack/react-query'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  type LinkComponentProps,
  Outlet,
  type RegisteredRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {startPageHost} from '@conciv/extension-testkit/host'
import tanstackExtension from 'virtual:conciv-extension-under-test'

const queryClient = new QueryClient()

const rootRoute = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return createElement(
    'div',
    null,
    createElement(
      'nav',
      null,
      createElement(Link, {to: '/'}, 'Home'),
      createElement(Link, {to: '/about'}, 'About'),
      createElement(Link, {to: '/form'}, 'Form'),
      createElement(Link, {to: '/boom'}, 'Boom'),
      createElement<LinkComponentProps<'a', RegisteredRouter, string, '/secret'>>(
        Link,
        {to: '/secret', search: {token: 'super-secret-value'}},
        'Token route',
      ),
    ),
    createElement('main', null, createElement(Outlet)),
  )
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

function HomePage() {
  return createElement(
    'section',
    null,
    createElement('h1', null, 'TanStack inspection home'),
    createElement('p', null, 'Welcome to the real TanStack Router host application.'),
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

function AboutPage() {
  const loaderData = aboutRoute.useLoaderData()
  const demo = useQuery({queryKey: ['spike', 'demo'], queryFn: async () => ({fetched: true})})
  return createElement(
    'section',
    null,
    createElement('h1', null, 'About this app'),
    createElement('p', null, 'Greeting: ', loaderData.server.greeting),
    createElement('p', null, 'Answer: ', loaderData.local.n),
    createElement('p', null, 'Tags: ', loaderData.local.tags.join(', ')),
    createElement('p', null, 'Query fetched: ', demo.data?.fetched ? 'yes' : 'pending'),
  )
}

const formRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/form',
  component: FormPage,
})

function FormPage() {
  return createElement(
    'section',
    null,
    createElement('h1', null, 'Form page'),
    createElement(
      'form',
      null,
      createElement('label', null, 'Name', createElement('input', {name: 'name', type: 'text'})),
      createElement('button', {type: 'submit'}, 'Submit'),
    ),
  )
}

const boomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/boom',
  component: BoomPage,
})

function BoomPage() {
  const trigger = () => {
    throw new Error('boom-from-event-handler')
  }
  return createElement(
    'section',
    null,
    createElement('h1', null, 'Boom page'),
    createElement('button', {type: 'button', onClick: trigger}, 'Trigger runtime error'),
  )
}

const secretRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/secret',
  validateSearch: (search: Record<string, unknown>): {token: string} => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  component: SecretPage,
})

function SecretPage() {
  return createElement('section', null, createElement('h1', null, 'Secret page'))
}

const routeTree = rootRoute.addChildren([indexRoute, aboutRoute, formRoute, boomRoute, secretRoute])

const router = createRouter({routeTree})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  return createElement(
    StrictMode,
    null,
    createElement(QueryClientProvider, {client: queryClient}, createElement(RouterProvider, {router})),
  )
}

const rootElement = document.getElementById('root')
if (rootElement) {
  createRoot(rootElement).render(createElement(App))
  void startPageHost(tanstackExtension)
}
