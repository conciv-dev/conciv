import {createElement, StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {QueryClient, QueryClientProvider, useQuery} from '@tanstack/react-query'
import {createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider} from '@tanstack/react-router'

const queryClient = new QueryClient()

const fetches = {count: 0}

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
  return createElement(
    'section',
    null,
    createElement('h1', null, 'About this app'),
    createElement('p', null, `Fetches: ${demo.data?.fetches ?? 0}`),
  )
}

const aboutRoute = createRoute({getParentRoute: () => rootRoute, path: '/about', component: AboutPage})

function BoomPage() {
  const trigger = () => {
    throw new Error('boom-from-event-handler')
  }
  return createElement('button', {type: 'button', onClick: trigger}, 'Trigger runtime error')
}

const boomRoute = createRoute({getParentRoute: () => rootRoute, path: '/boom', component: BoomPage})

const router = createRouter({routeTree: rootRoute.addChildren([indexRoute, aboutRoute, boomRoute])})

const rootElement = document.getElementById('root')
if (rootElement)
  createRoot(rootElement).render(
    createElement(
      StrictMode,
      null,
      createElement(QueryClientProvider, {client: queryClient}, createElement(RouterProvider, {router})),
    ),
  )
