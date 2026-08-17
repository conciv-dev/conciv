import {fileURLToPath} from 'node:url'
import {test} from 'vitest'
import {expect} from '@playwright/test'
import pingServer from '../fixtures/ping/server.js'
import {fixtureHost, getExtensionTestApi} from '../src/get-extension-test-api.js'

const hostDist = fileURLToPath(new URL('../dist/test-host', import.meta.url))

test('collapses a composer-slot extension action into the shared overflow menu when the row narrows', async () => {
  const api = await getExtensionTestApi({server: pingServer, host: fixtureHost(hostDist)})
  const composerButton = api.page.getByRole('button', {name: 'Echo from the composer'})
  const overflowTrigger = api.page.getByRole('button', {name: 'More composer actions'})
  try {
    await expect(composerButton).toBeVisible()
    await expect(overflowTrigger).toHaveCount(0)

    await api.page.getByLabel('Composer row width').fill('100')

    await expect(composerButton).toHaveCount(0)
    await expect(overflowTrigger).toBeVisible()

    await overflowTrigger.click()
    await expect(api.page.getByRole('menuitem', {name: 'Insert an echo'})).toBeVisible()
    await expect(api.page.getByRole('menuitem', {name: 'Clear the echo'})).toBeVisible()

    await api.page.getByRole('menuitem', {name: 'Insert an echo'}).click()
    await expect(api.page.getByText('Composer action: insert')).toBeVisible()

    await overflowTrigger.click()
    await api.page.getByRole('menuitem', {name: 'Clear the echo'}).click()
    await expect(api.page.getByText('Composer action: clear')).toBeVisible()
  } finally {
    await api.dispose()
  }
})
