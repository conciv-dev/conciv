import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {createRouter as createTanStackRouter} from '@tanstack/react-router'
import {routeTree} from './routeTree.gen'
import {NotFound} from '@/components/not-found'

export function getRouter() {
  const queryClient = new QueryClient()

  return createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
    Wrap: ({children}) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  })
}
