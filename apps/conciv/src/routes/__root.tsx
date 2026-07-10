import {Outlet, createRootRouteWithContext} from '@tanstack/solid-router'
import type {ConcivRouterContext} from '../router.js'
import '../styles.css'

export const Route = createRootRouteWithContext<ConcivRouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  return <Outlet />
}
