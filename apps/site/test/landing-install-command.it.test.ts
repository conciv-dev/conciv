import {expect} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {createSiteTest} from './site-fixture.js'
import {waitForLandingHydration} from './landing-page.js'

const SITE_PORT = 8794
const INSPECTOR_PORT = 9794
const ORIGIN = `http://127.0.0.1:${SITE_PORT}`

const test = createSiteTest({port: SITE_PORT, inspectorPort: INSPECTOR_PORT})

test.describe('landing install command', () => {
  test('switches the command with the package tabs, by click and by arrow keys', async ({browser}) => {
    const page = await browser.newPage()
    await page.goto(`${ORIGIN}/?widget=false`, {waitUntil: 'domcontentloaded'})
    await waitForLandingHydration(page)

    const tabs = page.getByRole('tablist', {name: 'Package manager'}).first()
    const command = page.locator('pre').filter({hasText: '@conciv/it'}).first()
    await expectLocator(command).toContainText('npm i -D @conciv/it', {timeout: 20_000})

    await tabs.getByRole('tab', {name: 'pnpm'}).click()
    await expectLocator(command).toContainText('pnpm add -D @conciv/it')

    await page.keyboard.press('ArrowRight')
    await expectLocator(tabs.getByRole('tab', {name: 'bun'})).toHaveAttribute('aria-selected', 'true')
    await expectLocator(command).toContainText('bun add -d @conciv/it')

    await page.keyboard.press('ArrowLeft')
    await expectLocator(command).toContainText('pnpm add -D @conciv/it')

    await page.close()
  }, 60_000)

  test('copies the command to the clipboard and announces it', async ({browser}) => {
    const page = await browser.newPage()
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(`${ORIGIN}/?widget=false`, {waitUntil: 'domcontentloaded'})
    await waitForLandingHydration(page)

    await page.getByRole('button', {name: 'Copy install command'}).first().click()
    await expectLocator(page.getByRole('status').filter({hasText: 'Copied'})).toHaveCount(1, {timeout: 20_000})
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npm i -D @conciv/it')

    await page.close()
  }, 60_000)

  test('remembers the chosen package manager across a reload', async ({browser}) => {
    const page = await browser.newPage()
    await page.goto(`${ORIGIN}/?widget=false`, {waitUntil: 'domcontentloaded'})
    await waitForLandingHydration(page)

    const tabs = page.getByRole('tablist', {name: 'Package manager'}).first()
    await tabs.getByRole('tab', {name: 'yarn'}).click({timeout: 20_000})
    await expectLocator(page.locator('pre').filter({hasText: '@conciv/it'}).first()).toContainText('yarn add -D')

    await page.reload({waitUntil: 'domcontentloaded'})
    await waitForLandingHydration(page)
    await expectLocator(tabs.getByRole('tab', {name: 'yarn'})).toHaveAttribute('aria-selected', 'true', {
      timeout: 20_000,
    })
    await expectLocator(page.locator('pre').filter({hasText: '@conciv/it'}).first()).toContainText('yarn add -D')

    await page.close()
  }, 60_000)

  test('tells the reader to select the text when the clipboard write fails', async ({browser}) => {
    const page = await browser.newPage()
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {writeText: () => Promise.reject(new Error('clipboard denied'))},
      })
    })
    await page.goto(`${ORIGIN}/?widget=false`, {waitUntil: 'domcontentloaded'})
    await waitForLandingHydration(page)

    await page.getByRole('button', {name: 'Copy install command'}).first().click({timeout: 20_000})
    await expectLocator(page.getByRole('status').filter({hasText: 'Copy failed. Select the text'})).toHaveCount(1)

    await page.close()
  }, 60_000)
})

test.describe('rapid tab switching lands on the last choice', () => {
  test('settles on yarn after npm, pnpm and bun are clicked without waiting', async ({browser}) => {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}})
    await page.goto(`${ORIGIN}/?widget=false`, {waitUntil: 'domcontentloaded'})
    await waitForLandingHydration(page)

    const tabs = page.getByRole('tablist', {name: 'Package manager'}).first()
    const command = page.locator('pre').filter({hasText: '@conciv/it'}).first()
    await expectLocator(command).toContainText('npm i -D @conciv/it', {timeout: 20_000})

    await tabs.getByRole('tab', {name: 'npm', exact: true}).click()
    await tabs.getByRole('tab', {name: 'pnpm'}).click()
    await tabs.getByRole('tab', {name: 'bun'}).click()
    await tabs.getByRole('tab', {name: 'yarn'}).click()

    await expectLocator(tabs.getByRole('tab', {name: 'yarn'})).toHaveAttribute('aria-selected', 'true')
    await expectLocator(command).toContainText('yarn add -D @conciv/it')

    await page.close()
  }, 60_000)

  test('settles on the Rspack config after Vite, Next.js and webpack are clicked without waiting', async ({
    browser,
  }) => {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}})
    await page.goto(`${ORIGIN}/?widget=false`, {waitUntil: 'domcontentloaded'})
    await waitForLandingHydration(page)

    const tabs = page.getByRole('tablist', {name: 'Frameworks'})
    await expectLocator(tabs.getByRole('tab', {name: 'Vite'})).toBeVisible({timeout: 20_000})

    await tabs.getByRole('tab', {name: 'Vite'}).click()
    await tabs.getByRole('tab', {name: 'Next.js'}).click()
    await tabs.getByRole('tab', {name: 'webpack'}).click()
    await tabs.getByRole('tab', {name: 'Rspack'}).click()

    await expectLocator(tabs.getByRole('tab', {name: 'Rspack'})).toHaveAttribute('aria-selected', 'true')
    await expectLocator(page.getByText('rspack.config.js', {exact: true})).toBeVisible()
    await expectLocator(page.getByRole('region', {name: 'rspack.config.js config'})).toContainText(
      '@conciv/it/plugin/rspack',
    )

    await page.close()
  }, 60_000)
})
