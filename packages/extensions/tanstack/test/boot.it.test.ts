import {expect, test} from 'vitest'
import {CONCIV_TANSTACK_CLIENT_SENTINEL} from '../src/client-sentinel.js'
import {gotoAbout, useTanstackTestApi, waitForAboutQuery, waitForWidget} from './helpers/tanstack-test-api.js'

const get = useTanstackTestApi()

test('real TanStack host app and the conciv widget both boot in a real browser', async () => {
  const {api} = get()

  await expect.poll(() => api.page.getByRole('heading', {name: 'TanStack inspection home'}).isVisible()).toBe(true)

  await waitForWidget(api.page)

  await gotoAbout(api.page)
  await expect.poll(() => api.page.getByText('Greeting: hello').isVisible()).toBe(true)
  await expect.poll(() => api.page.getByText('Answer: 42').isVisible()).toBe(true)
  await expect.poll(() => api.page.getByText('Tags: a, b').isVisible()).toBe(true)
  await waitForAboutQuery(api.page)
})

test('the tanstack client surface mounts a composer chip in the open widget', async () => {
  const {api} = get()

  await waitForWidget(api.page)
  await api.page.getByRole('button', {name: 'Open conciv chat'}).click()

  const chip = api.page
    .getByRole('dialog', {name: 'conciv chat agent'})
    .getByText(CONCIV_TANSTACK_CLIENT_SENTINEL, {exact: true})
  await expect.poll(() => chip.isVisible(), {timeout: 15_000}).toBe(true)
})
