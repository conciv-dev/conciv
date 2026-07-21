import {expect, test} from 'vitest'
import {useTanstackTestApi} from './helpers/tanstack-test-api.js'

const get = useTanstackTestApi()

test('real TanStack host app and the conciv widget both boot in a real browser', async () => {
  const {api} = get()

  await expect.poll(() => api.page.getByRole('heading', {name: 'TanStack inspection home'}).isVisible()).toBe(true)

  await expect
    .poll(() => api.page.getByRole('button', {name: 'Open conciv chat'}).isVisible(), {timeout: 30_000})
    .toBe(true)

  await api.page.getByRole('link', {name: 'About'}).click()

  await expect.poll(() => api.page.getByRole('heading', {name: 'About this app'}).isVisible()).toBe(true)
  await expect.poll(() => api.page.getByText('Greeting: hello').isVisible()).toBe(true)
  await expect.poll(() => api.page.getByText('Answer: 42').isVisible()).toBe(true)
  await expect.poll(() => api.page.getByText('Tags: a, b').isVisible()).toBe(true)
  await expect.poll(() => api.page.getByText('Query fetched: yes').isVisible(), {timeout: 10_000}).toBe(true)
})
