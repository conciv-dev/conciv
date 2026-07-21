import {expect, test} from 'vitest'
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

  const info = await tanstackAdapter(api).client.detect()
  expect(info).toEqual({name: 'tanstack-start', version: null, router: 'file-based', dev: true})
})

test('adapter.client.data surfaces the router loader cache for the real about route', async () => {
  const {api} = get()
  await waitForWidget(api.page)
  await gotoAbout(api.page)

  const adapter = tanstackAdapter(api)
  const entries = await adapter.client.data.entries()
  const about = entries.find((entry) => entry.key === '/about')
  expect(about).toBeDefined()
  expect(about?.state).toBe('fresh')
  expect(about?.updatedAt).not.toBeNull()

  const value = await adapter.client.data.get('/about')
  expect(value).toMatchObject({server: {greeting: 'hello'}})
})

test('adapter.client.data.invalidate re-runs the real router loader', async () => {
  const {api} = get()
  await waitForWidget(api.page)
  await gotoAbout(api.page)

  const adapter = tanstackAdapter(api)
  const readUpdatedAt = async () => {
    const entries = await adapter.client.data.entries()
    return entries.find((entry) => entry.key === '/about')?.updatedAt ?? null
  }

  const before = await readUpdatedAt()
  expect(before).not.toBeNull()

  await adapter.client.data.invalidate('/about')
  await expect
    .poll(
      async () => {
        const after = await readUpdatedAt()
        if (after === null || before === null) return false
        return after > before
      },
      {timeout: 10_000},
    )
    .toBe(true)
})

test('adapter.queryCache splits the live TanStack Query cache into queries and mutations', async () => {
  const {api} = get()
  await waitForWidget(api.page)

  await api.page.getByRole('link', {name: 'About'}).click()
  await waitForAboutQuery(api.page)

  const adapter = tanstackAdapter(api)
  const [queries, mutations] = await Promise.all([adapter.queryCache?.queries(), adapter.queryCache?.mutations()])
  expect(Array.isArray(mutations)).toBe(true)
  const demo = queries?.find((entry) => entry.key === JSON.stringify(['spike', 'demo']))
  expect(demo?.status).toBe('success')
})

test('adapter.client.errors.snapshot captures a real runtime error thrown in an event handler', async () => {
  const {api} = get()
  await waitForWidget(api.page)

  await api.page.getByRole('link', {name: 'Boom'}).click()
  await expect.poll(() => api.page.getByRole('heading', {name: 'Boom page'}).isVisible()).toBe(true)
  await api.page.getByRole('button', {name: 'Trigger runtime error'}).click()

  const adapter = tanstackAdapter(api)
  await expect
    .poll(
      async () => {
        const errors = await adapter.client.errors.snapshot()
        return errors.some((error) => error.kind === 'runtime' && error.message.includes('boom-from-event-handler'))
      },
      {timeout: 10_000},
    )
    .toBe(true)
})
