import {expect, test} from 'vitest'
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
