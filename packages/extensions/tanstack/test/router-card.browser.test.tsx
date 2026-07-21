import {describe, expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {mountToolCard} from '@conciv/extension-testkit/card-harness'
import {BackCard} from '../src/tool/back-card.js'
import {LoaderDataCard} from '../src/tool/loader-data-card.js'
import {NavigateCard} from '../src/tool/navigate-card.js'
import {QueryCacheCard} from '../src/tool/query-cache-card.js'
import {QueryInvalidateCard} from '../src/tool/query-invalidate-card.js'
import {QueryRefetchCard} from '../src/tool/query-refetch-card.js'
import {RouterInvalidateCard} from '../src/tool/router-invalidate-card.js'
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

const QUERY_CACHE = JSON.stringify({
  queries: [
    {
      key: '["spike","demo"]',
      state: 'fresh',
      status: 'success',
      observers: 1,
      updatedAt: Date.now(),
      value: {fetched: true},
      error: null,
    },
    {key: '["users"]', state: 'stale', status: 'success', observers: 0, updatedAt: Date.now(), value: [], error: null},
  ],
  mutations: [],
})

describe('QueryCacheCard (real browser)', () => {
  it('renders a loading affordance while the tool is running', async () => {
    mountToolCard(QueryCacheCard, {name: 'tanstack_query_cache'})
    await expect.element(page.getByText('reading…')).toBeVisible()
  })

  it('shows the cached query keys and states on success', async () => {
    mountToolCard(QueryCacheCard, {name: 'tanstack_query_cache', content: QUERY_CACHE})
    await expect.element(page.getByText('2 queries')).toBeVisible()
    await page.getByRole('button', {name: /tanstack_query_cache/}).click()
    await expect.element(page.getByText('["spike","demo"]')).toBeVisible()
    await expect.element(page.getByText('fresh')).toBeVisible()
    await expect.element(page.getByText('stale')).toBeVisible()
  })

  it('renders the error message when the verb fails', async () => {
    mountToolCard(QueryCacheCard, {
      name: 'tanstack_query_cache',
      content: JSON.stringify({code: 'handler-error', message: 'TanStack QueryClient not found on page'}),
      state: 'error',
    })
    await page.getByRole('button', {name: /tanstack_query_cache/}).click()
    await expect.element(page.getByText('TanStack QueryClient not found on page')).toBeVisible()
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

describe('NavigateCard (real browser)', () => {
  it('renders a loading affordance while the action runs', async () => {
    mountToolCard(NavigateCard, {name: 'tanstack_navigate', args: {to: '/form'}})
    await expect.element(page.getByText('running…')).toBeVisible()
  })

  it('confirms the target route on success', async () => {
    mountToolCard(NavigateCard, {
      name: 'tanstack_navigate',
      args: {to: '/form'},
      content: JSON.stringify({ok: true, to: '/form'}),
    })
    await expect.element(page.getByText('→ /form')).toBeVisible()
  })

  it('renders the error message when the action fails', async () => {
    mountToolCard(NavigateCard, {
      name: 'tanstack_navigate',
      args: {to: '/form'},
      content: JSON.stringify({code: 'handler-error', message: 'TanStack router not found on page'}),
      state: 'error',
    })
    await page.getByRole('button', {name: /tanstack_navigate/}).click()
    await expect.element(page.getByText('TanStack router not found on page')).toBeVisible()
  })
})

describe('RouterInvalidateCard (real browser)', () => {
  it('renders a loading affordance while the action runs', async () => {
    mountToolCard(RouterInvalidateCard, {name: 'tanstack_invalidate'})
    await expect.element(page.getByText('running…')).toBeVisible()
  })

  it('confirms invalidation on success', async () => {
    mountToolCard(RouterInvalidateCard, {name: 'tanstack_invalidate', content: JSON.stringify({ok: true})})
    await expect.element(page.getByText('invalidated')).toBeVisible()
  })

  it('renders the error message when the action fails', async () => {
    mountToolCard(RouterInvalidateCard, {
      name: 'tanstack_invalidate',
      content: JSON.stringify({code: 'handler-error', message: 'TanStack router invalidate is not available'}),
      state: 'error',
    })
    await page.getByRole('button', {name: /tanstack_invalidate/}).click()
    await expect.element(page.getByText('TanStack router invalidate is not available')).toBeVisible()
  })
})

describe('BackCard (real browser)', () => {
  it('confirms navigation back on success', async () => {
    mountToolCard(BackCard, {name: 'tanstack_back', content: JSON.stringify({ok: true})})
    await expect.element(page.getByText('went back')).toBeVisible()
  })
})

describe('QueryInvalidateCard (real browser)', () => {
  it('renders a loading affordance while the action runs', async () => {
    mountToolCard(QueryInvalidateCard, {name: 'tanstack_query_invalidate', args: {key: '["spike","demo"]'}})
    await expect.element(page.getByText('running…')).toBeVisible()
  })

  it('confirms the invalidated key on success', async () => {
    mountToolCard(QueryInvalidateCard, {
      name: 'tanstack_query_invalidate',
      args: {key: '["spike","demo"]'},
      content: JSON.stringify({ok: true}),
    })
    await expect.element(page.getByText('invalidated ["spike","demo"]')).toBeVisible()
  })

  it('renders the error message when the action fails', async () => {
    mountToolCard(QueryInvalidateCard, {
      name: 'tanstack_query_invalidate',
      args: {key: '["spike","demo"]'},
      content: JSON.stringify({code: 'handler-error', message: 'TanStack QueryClient not found on page'}),
      state: 'error',
    })
    await page.getByRole('button', {name: /tanstack_query_invalidate/}).click()
    await expect.element(page.getByText('TanStack QueryClient not found on page')).toBeVisible()
  })
})

describe('QueryRefetchCard (real browser)', () => {
  it('confirms the refetched key on success', async () => {
    mountToolCard(QueryRefetchCard, {
      name: 'tanstack_query_refetch',
      args: {key: '["spike","demo"]'},
      content: JSON.stringify({ok: true}),
    })
    await expect.element(page.getByText('refetched ["spike","demo"]')).toBeVisible()
  })
})
