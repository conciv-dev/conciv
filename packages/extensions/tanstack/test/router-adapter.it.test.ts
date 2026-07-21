import {expect, test} from 'vitest'
import {z} from 'zod'
import {gotoAbout, useTanstackTestApi, waitForAboutQuery, waitForWidget} from './helpers/tanstack-test-api.js'

const get = useTanstackTestApi()

const routerStateSchema = z.object({
  location: z.object({pathname: z.string(), search: z.string(), hash: z.string()}),
  matches: z.array(z.object({routeId: z.string(), path: z.string(), loaderData: z.unknown()})),
})

type RouteNodeShape = {id: string; children: RouteNodeShape[]}

const routeNodeSchema: z.ZodType<RouteNodeShape> = z.lazy(() =>
  z.object({id: z.string(), children: z.array(routeNodeSchema)}),
)

function collectIds(node: RouteNodeShape): string[] {
  return [node.id, ...node.children.flatMap(collectIds)]
}

test('callTool drives the fiber-walk adapter against the running TanStack app', async () => {
  const {api} = get()

  await waitForWidget(api.page)
  await gotoAbout(api.page)
  await waitForAboutQuery(api.page)

  const state = routerStateSchema.parse(await api.callTool('tanstack_router_state', {}))
  expect(state.location.pathname).toBe('/about')
  const aboutMatch = state.matches.find((match) => match.routeId === '/about')
  expect(aboutMatch).toBeDefined()
  expect(aboutMatch?.loaderData).toBeTruthy()

  const tree = routeNodeSchema.parse(await api.callTool('tanstack_route_tree', {}))
  const ids = collectIds(tree)
  expect(ids.length).toBeGreaterThanOrEqual(4)
})

const searchStateSchema = z.object({
  matches: z.array(z.object({routeId: z.string(), search: z.record(z.string(), z.unknown())})),
})

test('tanstack_router_state redacts secret-keyed search params through dehydrate', async () => {
  const {api} = get()

  await waitForWidget(api.page)
  await api.page.getByRole('link', {name: 'Token route'}).click()
  await expect.poll(() => api.page.getByRole('heading', {name: 'Secret page'}).isVisible()).toBe(true)

  const payload = await api.callTool('tanstack_router_state', {})
  const state = searchStateSchema.parse(payload)
  const secretMatch = state.matches.find((match) => match.routeId === '/secret')
  expect(secretMatch).toBeDefined()
  expect(secretMatch?.search.token).toBe('[redacted]')
  expect(JSON.stringify(state.matches)).not.toContain('super-secret-value')
})

const cacheEntrySchema = z.object({
  key: z.string(),
  state: z.enum(['fresh', 'stale', 'fetching', 'error']),
  status: z.string().nullable(),
  observers: z.number().nullable(),
  updatedAt: z.number().nullable(),
})

const queryCacheSchema = z.object({queries: z.array(cacheEntrySchema), mutations: z.array(cacheEntrySchema)})

test('tanstack_query_cache extracts the live TanStack Query cache from the running app', async () => {
  const {api} = get()

  await waitForWidget(api.page)
  await gotoAbout(api.page)
  await waitForAboutQuery(api.page)

  const cache = queryCacheSchema.parse(await api.callTool('tanstack_query_cache', {}))
  const demo = cache.queries.find((entry) => entry.key === JSON.stringify(['spike', 'demo']))
  expect(demo).toBeDefined()
  expect(demo?.status).toBe('success')
  expect(demo?.observers).toBe(1)
})

test('tanstack_navigate drives real TanStack Router navigation on the running app', async () => {
  const {api} = get()

  await waitForWidget(api.page)

  await api.callTool('tanstack_navigate', {to: '/form'})

  await expect
    .poll(async () => routerStateSchema.parse(await api.callTool('tanstack_router_state', {})).location.pathname, {
      timeout: 10_000,
    })
    .toBe('/form')
  await expect.poll(() => api.page.getByRole('heading', {name: 'Form page'}).isVisible()).toBe(true)
})

test('tanstack_query_invalidate no-ops on unknown keys and refetches the real key on the running app', async () => {
  const {api} = get()

  await waitForWidget(api.page)
  await gotoAbout(api.page)
  await waitForAboutQuery(api.page)

  const demoKey = JSON.stringify(['spike', 'demo'])
  const readDemo = async () => {
    const cache = queryCacheSchema.parse(await api.callTool('tanstack_query_cache', {}))
    return cache.queries.find((entry) => entry.key === demoKey)
  }

  const before = await readDemo()
  expect(before?.status).toBe('success')
  expect(before?.updatedAt).not.toBeNull()

  await api.callTool('tanstack_query_invalidate', {key: JSON.stringify(['nope', 'nope'])})
  const afterUnknown = await readDemo()
  expect(afterUnknown?.updatedAt).toBe(before?.updatedAt)
  expect(afterUnknown?.state).toBe(before?.state)

  await api.callTool('tanstack_query_invalidate', {key: demoKey})
  await expect
    .poll(
      async () => {
        const after = await readDemo()
        if (!after || after.updatedAt === null || before?.updatedAt == null) return false
        return after.updatedAt > before.updatedAt
      },
      {timeout: 10_000},
    )
    .toBe(true)
})

const truncationMarkerSchema = z.object({__conciv: z.literal('object'), preview: z.literal('{…}')}).loose()

const loaderDataSchema = z.object({
  server: z.object({greeting: z.string()}).loose(),
  local: z.object({n: z.number()}).loose(),
  deep: z.object({a: truncationMarkerSchema}).loose(),
})

test('tanstack_loader_data returns dehydrated leaf loader data with depth truncation applied', async () => {
  const {api} = get()

  await waitForWidget(api.page)
  await gotoAbout(api.page)

  const payload = await api.callTool('tanstack_loader_data', {})
  const loaderData = loaderDataSchema.parse(payload)

  expect(Object.keys(loaderData)).toEqual(expect.arrayContaining(['server', 'local', 'deep']))
  expect(loaderData.deep.a.__conciv).toBe('object')
  expect(loaderData.deep.a.preview).toBe('{…}')
  expect(JSON.stringify(payload)).not.toContain('too-deep')
})
