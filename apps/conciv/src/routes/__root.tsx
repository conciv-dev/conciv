import {Outlet, createRootRoute} from '@tanstack/solid-router'
import {TanStackRouterDevtools} from '@tanstack/solid-router-devtools'

import '../styles.css'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </>
  )
}
