import {fileURLToPath} from 'node:url'
import {test} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {defineExtension} from '@conciv/extension'
import {fixtureHost, getExtensionTestApi} from '@conciv/extension-testkit'

const hostDist = fileURLToPath(new URL('../dist/test-host', import.meta.url))
const permissionStub = fileURLToPath(new URL('./fixture/local-network-access-stub.js', import.meta.url))

const WAITING_COPY = 'Waiting for your agent…'
const BLOCKED_STEP_COPY =
  'Local network access was blocked. Click the site icon in the address bar, allow local network access, and reload.'
const BLOCKED_STATUS_COPY = "Local network access is blocked, so your agent can't reach this tab."

test('a denied local-network-access permission replaces the waiting copy, and granting it restores the wait', async () => {
  const api = await getExtensionTestApi({
    server: defineExtension({name: 'try-it-connect-fixture'}),
    host: fixtureHost(hostDist),
  })
  try {
    const {page} = api
    await expectLocator(page.getByText(WAITING_COPY)).toBeVisible({timeout: 20_000})
    await expectLocator(page.getByRole('alert')).toHaveCount(0, {timeout: 10_000})

    await page.addInitScript({path: permissionStub})
    await page.reload({waitUntil: 'domcontentloaded'})
    await expectLocator(page.getByRole('alert')).toHaveText(BLOCKED_STEP_COPY, {timeout: 20_000})
    await expectLocator(page.getByText(BLOCKED_STATUS_COPY)).toBeVisible({timeout: 10_000})
    await expectLocator(page.getByText(WAITING_COPY)).toHaveCount(0, {timeout: 10_000})

    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent('local-network-access-state', {detail: 'granted'})),
    )
    await expectLocator(page.getByText(WAITING_COPY)).toBeVisible({timeout: 20_000})
    await expectLocator(page.getByRole('alert')).toHaveCount(0, {timeout: 10_000})
  } finally {
    await api.dispose()
  }
}, 180_000)
