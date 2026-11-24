import {makeRpcClient} from '@conciv/contract'
import {CONNECT_FIRST_PORT} from '@conciv/protocol/connect-ports'
import {expect, test} from '@conciv/e2e-utils/fixtures'
import type {Page} from '@playwright/test'

function engineToken(): string {
  const token = process.env.CONCIV_E2E_MOUNT_API_TOKEN
  if (token === undefined) throw new Error('playwright.config.ts names no token for the connect engines')
  return token
}

async function namedSession(apiBase: string, title: string): Promise<void> {
  const client = makeRpcClient(apiBase, {token: engineToken()})
  const {sessionId} = await client.sessions.create()
  await client.sessions.rename({sessionId, title})
}

async function typeInto(page: Page, name: string, text: string): Promise<void> {
  const field = page.getByRole('textbox', {name})
  await field.click()
  await expect(field).toBeFocused()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Backspace')
  await page.keyboard.type(text)
  await expect(field).toHaveValue(text)
}

test.describe('a vite react page drives the widget through the public mount api', () => {
  test.use({signedIn: false})

  test('the page mounts the widget, opens, closes and toggles the panel, rebinds it to another engine, asking the page for the new token before the rebind ends, unmounts it, a remount in the same tab reopens its last screen, and a second mountConciv call keeps the one script widget', async ({
    page,
  }) => {
    const first = `http://127.0.0.1:${CONNECT_FIRST_PORT}`
    const second = `http://127.0.0.1:${CONNECT_FIRST_PORT + 1}`
    await namedSession(first, 'Work on the first engine')
    await namedSession(second, 'Work on the second engine')
    const status = page.getByRole('status', {name: 'Page status'})

    await page.goto('/mount-api.html', {waitUntil: 'domcontentloaded'})
    await typeInto(page, 'Engine address', first)
    await typeInto(page, 'Engine token', engineToken())
    await page.getByRole('button', {name: 'Send token'}).click()
    await expect(status).toHaveText('Token sent')
    await page.getByRole('button', {name: 'Mount', exact: true}).click()
    await expect(status).toHaveText('Mounted')
    const launcher = page.getByRole('button', {name: 'Open conciv chat'})
    await expect(launcher).toBeVisible()

    const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
    await page.getByRole('button', {name: 'Open', exact: true}).click()
    await expect(panel).toBeVisible()
    await page.getByRole('button', {name: 'Close', exact: true}).click()
    await expect(panel).toBeHidden()
    await expect(launcher).toBeVisible()
    await page.getByRole('button', {name: 'Toggle', exact: true}).click()
    await expect(panel).toBeVisible()
    await page.getByRole('button', {name: 'Toggle', exact: true}).click()
    await expect(panel).toBeHidden()

    await typeInto(page, 'Engine address', second)
    await page.getByRole('button', {name: 'Rebind'}).click()
    await expect(status).toHaveText('The widget asks for a token')
    await page.getByRole('button', {name: 'Send token'}).click()
    await expect(status).toHaveText('Rebound')
    await page.getByRole('button', {name: 'Open', exact: true}).click()
    await page.getByRole('button', {name: 'Work on the second engine, session options'}).click()
    await page.getByRole('button', {name: 'Session: Work on the second engine'}).click()
    await expect(page.getByRole('option', {name: /^Work on the second engine, /})).toBeVisible()
    await expect(page.getByRole('option')).toHaveCount(1)
    await page.keyboard.press('Escape')

    await page.getByRole('button', {name: 'Unmount'}).click()
    await expect(status).toHaveText('Unmounted')
    await expect(launcher).toHaveCount(0)
    await page.getByRole('button', {name: 'Mount', exact: true}).click()
    await expect(status).toHaveText('Mounted')
    await expect(panel).toBeVisible()

    await page.getByRole('button', {name: 'Unmount'}).click()
    await expect(launcher).toHaveCount(0)
    await page.getByRole('button', {name: 'Mount the script widget twice'}).click()
    await expect(status).toHaveText('Mounted the script widget twice')
    await expect(page.getByRole('button', {name: 'Log in'})).toBeVisible()
    await expect(page.getByRole('button', {name: /conciv chat$/})).toHaveCount(1)
  })
})
