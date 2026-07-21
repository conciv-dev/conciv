import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {mountToolCard} from '@conciv/extension-testkit/card-harness'
import {LoaderDataCard} from '../src/tool/loader-data-card.js'
import {RouterStateCard} from '../src/tool/router-state-card.js'
import {RouteTreeCard} from '../src/tool/route-tree-card.js'

const ROUTER_STATE = JSON.stringify({
  location: {pathname: '/about', search: '', hash: ''},
  matches: [
    {routeId: '__root__', path: ''},
    {routeId: '/about', path: '/about'},
  ],
})

const ROUTE_TREE = JSON.stringify({
  id: '__root__',
  hasLoader: false,
  children: [
    {id: '/', hasLoader: false, children: []},
    {id: '/about', hasLoader: true, children: []},
  ],
})

const LOADER_DATA = JSON.stringify({
  server: {greeting: 'hello'},
  local: {n: 42},
  deep: {__conciv: 'object', size: 1, preview: '{…}'},
})

describe('RouterStateCard (real browser)', () => {
  it('renders a loading affordance while the tool is running', async () => {
    mountToolCard(RouterStateCard, {name: 'tanstack_router_state'})
    await expect.element(page.getByText('reading…')).toBeVisible()
  })

  it('shows the current route path and match count on success', async () => {
    mountToolCard(RouterStateCard, {name: 'tanstack_router_state', content: ROUTER_STATE})
    await expect.element(page.getByText('/about · 2 matches')).toBeVisible()
    await page.getByRole('button', {name: /tanstack_router_state/}).click()
    await expect.element(page.getByText('__root__')).toBeVisible()
  })

  it('renders the error message when the verb fails', async () => {
    mountToolCard(RouterStateCard, {
      name: 'tanstack_router_state',
      content: JSON.stringify({code: 'handler-error', message: 'TanStack router not found on page'}),
      state: 'error',
    })
    await page.getByRole('button', {name: /tanstack_router_state/}).click()
    await expect.element(page.getByText('TanStack router not found on page')).toBeVisible()
  })
})

describe('RouteTreeCard (real browser)', () => {
  it('renders a loading affordance while the tool is running', async () => {
    mountToolCard(RouteTreeCard, {name: 'tanstack_route_tree'})
    await expect.element(page.getByText('reading…')).toBeVisible()
  })

  it('shows the route ids on success', async () => {
    mountToolCard(RouteTreeCard, {name: 'tanstack_route_tree', content: ROUTE_TREE})
    await expect.element(page.getByText('3 routes')).toBeVisible()
    await page.getByRole('button', {name: /tanstack_route_tree/}).click()
    await expect.element(page.getByText('__root__')).toBeVisible()
    await expect.element(page.getByText('/about', {exact: true})).toBeVisible()
  })

  it('renders the error message when the verb fails', async () => {
    mountToolCard(RouteTreeCard, {
      name: 'tanstack_route_tree',
      content: JSON.stringify({code: 'timeout', message: 'page verb timed out'}),
      state: 'error',
    })
    await page.getByRole('button', {name: /tanstack_route_tree/}).click()
    await expect.element(page.getByText('page verb timed out')).toBeVisible()
  })
})

describe('LoaderDataCard (real browser)', () => {
  it('renders a loading affordance while the tool is running', async () => {
    mountToolCard(LoaderDataCard, {name: 'tanstack_loader_data'})
    await expect.element(page.getByText('reading…')).toBeVisible()
  })

  it('shows the loader keys and truncation marker on success', async () => {
    mountToolCard(LoaderDataCard, {name: 'tanstack_loader_data', content: LOADER_DATA})
    await expect.element(page.getByText('3 keys')).toBeVisible()
    await page.getByRole('button', {name: /tanstack_loader_data/}).click()
    await expect.element(page.getByText('server')).toBeVisible()
    await expect.element(page.getByText('deep')).toBeVisible()
    await expect.element(page.getByText('{…}')).toBeVisible()
  })

  it('renders the error message when the verb fails', async () => {
    mountToolCard(LoaderDataCard, {
      name: 'tanstack_loader_data',
      content: JSON.stringify({code: 'handler-error', message: 'TanStack router not found on page'}),
      state: 'error',
    })
    await page.getByRole('button', {name: /tanstack_loader_data/}).click()
    await expect.element(page.getByText('TanStack router not found on page')).toBeVisible()
  })
})
