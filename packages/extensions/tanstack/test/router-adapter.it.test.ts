import {expect, test} from 'vitest'
import {z} from 'zod'
import {useTanstackTestApi} from './helpers/tanstack-test-api.js'

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

  await expect
    .poll(() => api.page.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 30_000})
    .toBe(true)

  await api.page.getByRole('link', {name: 'About'}).click()
  await expect.poll(() => api.page.getByRole('heading', {name: 'About this app'}).isVisible()).toBe(true)
  await expect.poll(() => api.page.getByText('Query fetched: yes').isVisible(), {timeout: 10_000}).toBe(true)

  const state = routerStateSchema.parse(await api.callTool('tanstack_router_state', {}))
  expect(state.location.pathname).toBe('/about')
  const aboutMatch = state.matches.find((match) => match.routeId === '/about')
  expect(aboutMatch).toBeDefined()
  expect(aboutMatch?.loaderData).toBeTruthy()

  const tree = routeNodeSchema.parse(await api.callTool('tanstack_route_tree', {}))
  const ids = collectIds(tree)
  expect(ids.length).toBeGreaterThanOrEqual(4)
})

const truncationMarkerSchema = z.object({__conciv: z.literal('object'), preview: z.literal('{…}')}).loose()

const loaderDataSchema = z.object({
  server: z.object({greeting: z.string()}).loose(),
  local: z.object({n: z.number()}).loose(),
  deep: z.object({a: truncationMarkerSchema}).loose(),
})

test('tanstack_loader_data returns dehydrated leaf loader data with depth truncation applied', async () => {
  const {api} = get()

  await expect
    .poll(() => api.page.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 30_000})
    .toBe(true)

  await api.page.getByRole('link', {name: 'About'}).click()
  await expect.poll(() => api.page.getByRole('heading', {name: 'About this app'}).isVisible()).toBe(true)

  const payload = await api.callTool('tanstack_loader_data', {})
  const loaderData = loaderDataSchema.parse(payload)

  expect(Object.keys(loaderData)).toEqual(expect.arrayContaining(['server', 'local', 'deep']))
  expect(loaderData.deep.a.__conciv).toBe('object')
  expect(loaderData.deep.a.preview).toBe('{…}')
  expect(JSON.stringify(payload)).not.toContain('too-deep')
})
