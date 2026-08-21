import {test} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {CONCIV_TANSTACK_CLIENT_LABEL} from '../src/client-sentinel.js'
import {gotoAbout, useTanstackTestApi, waitForAboutQuery, waitForWidget} from './helpers/tanstack-test-api.js'

const get = useTanstackTestApi()

test('real TanStack host app and the conciv widget both boot in a real browser', async () => {
  const {api} = get()

  await expectLocator(api.page.getByRole('heading', {name: 'TanStack inspection home'})).toBeVisible()

  await waitForWidget(api.page)

  await gotoAbout(api.page)
  await expectLocator(api.page.getByText('Greeting: hello')).toBeVisible()
  await expectLocator(api.page.getByText('Answer: 42')).toBeVisible()
  await expectLocator(api.page.getByText('Tags: a, b')).toBeVisible()
  await waitForAboutQuery(api.page)
})

test('the tanstack client surface mounts an inspector status chip that stays visible in the panel', async () => {
  const {api} = get()

  await waitForWidget(api.page)
  await api.page.getByRole('button', {name: 'Open conciv chat'}).click()

  const chip = api.page
    .getByRole('dialog', {name: 'conciv chat agent'})
    .getByRole('status', {name: CONCIV_TANSTACK_CLIENT_LABEL})
  await expectLocator(chip).toBeVisible({timeout: 15_000})
})
