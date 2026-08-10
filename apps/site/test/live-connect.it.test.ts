import {afterAll, expect} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {createFakeHarness} from '@conciv/harness-testkit'
import {runConnect} from '@conciv/try'
import type {Engine} from '@conciv/core/start'
import {createSiteTest} from './site-fixture.js'

const SITE_PORT = 8787
const INSPECTOR_PORT = 9787
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`

const test = createSiteTest({port: SITE_PORT, inspectorPort: INSPECTOR_PORT})

let engine: Engine | null = null

afterAll(async () => {
  await engine?.stop()
})

test.describe('widget-native live connect on the built site', () => {
  test('boots the widget into connect steps and hands off in place to live chat', async ({browser}) => {
    const page = await browser.newPage()
    await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})
    const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
    await expectLocator(panel.getByText('Drive this page with your agent.')).toBeVisible({timeout: 20_000})

    const command = await panel
      .getByText(/^npx @conciv\/try --token \S+$/)
      .filter({visible: true})
      .textContent()
    const token = command?.match(/--token (\S+)/)?.[1] ?? ''
    expect(token).not.toBe('')

    const before = await panel.elementHandle()
    engine = await runConnect({
      token,
      harnessAdapter: createFakeHarness({id: 'fake-e2e', text: 'hello from e2e'}),
      origin: ORIGIN,
    })

    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await expectLocator(input).toBeVisible({timeout: 30_000})

    const sameNode = await page.evaluate(
      (node) => node === document.querySelector('[data-conciv-root]')?.shadowRoot?.querySelector('[data-pw-panel]'),
      before,
    )
    expect(sameNode).toBe(true)
    await expectLocator(panel.getByText('Agent connected. It’s driving this page from your machine.')).toBeVisible({
      timeout: 10_000,
    })

    await input.fill('hello')
    await input.press('Enter')
    await expectLocator(page.getByText('hello from e2e').first()).toBeVisible({timeout: 30_000})

    await page.reload({waitUntil: 'domcontentloaded'})
    const inputAfterReload = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await expectLocator(inputAfterReload).toBeVisible({timeout: 30_000})
    await page.close()

    await engine.stop()
    engine = null
  }, 180_000)

  test('remembers a pre-connect dismissal, and ?try=1 forces the panel open again', async ({browser}) => {
    const page = await browser.newPage()
    await page.goto(ORIGIN, {waitUntil: 'domcontentloaded'})
    const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
    await expectLocator(panel.getByText('Drive this page with your agent.')).toBeVisible({timeout: 20_000})

    await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
    await expectLocator(panel).toBeHidden({timeout: 10_000})

    await page.reload({waitUntil: 'domcontentloaded'})
    await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: 20_000})
    expect(await panel.isVisible()).toBe(false)

    await page.goto(`${ORIGIN}/?try=1`, {waitUntil: 'domcontentloaded'})
    await expectLocator(panel.getByText('Drive this page with your agent.')).toBeVisible({timeout: 20_000})
    await page.close()
  }, 90_000)
})
