import * as Sentry from '@sentry/tanstackstart-react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {createRouter as createTanStackRouter} from '@tanstack/react-router'
import {routeTree} from './routeTree.gen'
import {NotFound} from '@/components/not-found'
import {sentryOptions} from '@/lib/sentry-options'

export function getRouter() {
  const queryClient = new QueryClient()

  const router = createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
    Wrap: ({children}) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  })

  if (!router.isServer) {
    Sentry.init({...sentryOptions(), integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)]})
  }

  return router
}
