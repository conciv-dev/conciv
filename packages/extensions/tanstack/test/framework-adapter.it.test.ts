import {expect, test} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {
  gotoAbout,
  tanstackAdapter,
  useTanstackTestApi,
  waitForAboutQuery,
  waitForWidget,
} from './helpers/tanstack-test-api.js'

const get = useTanstackTestApi()

test('adapter.client.detect reports the running framework against the real app', async () => {
  const {api} = get()
  await waitForWidget(api.page)

  const info = await tanstackAdapter(api).client.detect(api.session)
  expect(info).toEqual({name: 'tanstack-start', version: null, router: 'file-based', dev: true})
})

test('adapter.client.data surfaces the router loader cache for the real about route', async () => {
  const {api} = get()
  await waitForWidget(api.page)
  await gotoAbout(api.page)

  const adapter = tanstackAdapter(api)
  const entries = await adapter.client.data.entries(api.session)
  const about = entries.find((entry) => entry.key === '/about')
  expect(about).toBeDefined()
  expect(about?.state).toBe('fresh')
  expect(about?.updatedAt).not.toBeNull()

  const value = await adapter.client.data.get(api.session, '/about')
  expect(value).toMatchObject({server: {greeting: 'hello'}})
})

test('adapter.client.data.invalidate re-runs the real router loader', async () => {
  const {api} = get()
  await waitForWidget(api.page)
  await gotoAbout(api.page)

  const adapter = tanstackAdapter(api)
  const readUpdatedAt = async () => {
    const entries = await adapter.client.data.entries(api.session)
    return entries.find((entry) => entry.key === '/about')?.updatedAt ?? null
  }

  const before = await readUpdatedAt()
  expect(before).not.toBeNull()

  await adapter.client.data.invalidate(api.session, '/about')
  expect(await readUpdatedAt()).toBeGreaterThan(before ?? 0)
})

test('adapter.queryCache splits the live TanStack Query cache into queries and mutations', async () => {
  const {api} = get()
  await waitForWidget(api.page)

  await api.page.getByRole('link', {name: 'About'}).click()
  await waitForAboutQuery(api.page)

  const adapter = tanstackAdapter(api)
  const [queries, mutations] = await Promise.all([
    adapter.queryCache?.queries(api.session),
    adapter.queryCache?.mutations(api.session),
  ])
  expect(Array.isArray(mutations)).toBe(true)
  const demo = queries?.find((entry) => entry.key === JSON.stringify(['spike', 'demo']))
  expect(demo?.status).toBe('success')
})

test('adapter.client.errors.snapshot captures a real runtime error thrown in an event handler', async () => {
  const {api} = get()
  await waitForWidget(api.page)

  await api.page.getByRole('link', {name: 'Boom'}).click()
  await expectLocator(api.page.getByRole('heading', {name: 'Boom page'})).toBeVisible()
  const crashed = api.page.waitForEvent('pageerror')
  await api.page.getByRole('button', {name: 'Trigger runtime error'}).click()
  expect(String(await crashed)).toContain('boom-from-event-handler')

  const adapter = tanstackAdapter(api)
  const captured = await adapter.client.errors.snapshot(api.session)
  expect(captured.some((error) => error.kind === 'runtime' && error.message.includes('boom-from-event-handler'))).toBe(
    true,
  )
})
