import {createRoute, redirect} from '@tanstack/solid-router'
import {layoutRoute} from './layout.js'

export const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({to: '/list', search: true, replace: true})
  },
})
