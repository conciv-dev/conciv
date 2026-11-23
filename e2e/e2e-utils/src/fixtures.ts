import {readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {test as base, expect, type Page} from '@playwright/test'
import {e2eConfigDir} from './config.js'
import {e2ePluginCopyDir} from './state-dir.js'
import {collectFailures, expectWidgetBoots, loginWidget} from './widget.js'

type RebuildPlugin = (plugin: string, from: string, to: string) => Promise<void>

async function signIn(page: Page): Promise<void> {
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectWidgetBoots(page, failures)
}

async function startNewSession(page: Page): Promise<void> {
  const launcher = page.getByRole('button', {name: /conciv chat$/})
  if ((await launcher.getAttribute('aria-expanded')) !== 'true') await launcher.click()
  await page.getByRole('button', {name: /, session options$/}).click()
  await page.getByRole('button', {name: /^Session: /}).click()
  await page.getByRole('button', {name: 'New session', exact: true}).click()
  await expect(page.getByText('Started a new session')).toBeVisible()
}

async function signInToNewSession(page: Page): Promise<void> {
  const failures = collectFailures(page)
  await loginWidget(page)
  await startNewSession(page)
  await expectWidgetBoots(page, failures)
}

export const test = base.extend<{
  signedIn: boolean
  secondPage: Page
  rebuildPlugin: RebuildPlugin
}>({
  signedIn: [true, {option: true}],
  page: async ({page, signedIn}, use) => {
    if (signedIn) await signInToNewSession(page)
    await use(page)
  },
  secondPage: async ({browser, signedIn}, use) => {
    const page = await browser.newPage()
    if (signedIn) await signIn(page)
    await use(page)
    await page.close()
  },
  // eslint-disable-next-line no-empty-pattern
  rebuildPlugin: async ({}, use, testInfo) => {
    const originals: {bundle: string; source: string}[] = []
    await use(async (plugin, from, to) => {
      const bundle = join(e2ePluginCopyDir(e2eConfigDir(testInfo.config.configFile), plugin), 'plugin-experimental.js')
      const source = await readFile(bundle, 'utf8')
      originals.unshift({bundle, source})
      if (!source.includes(from)) throw new Error(`${bundle} does not contain "${from}"`)
      await writeFile(bundle, source.replace(from, to))
    })
    for (const {bundle, source} of originals) await writeFile(bundle, source)
  },
})

export {expect} from '@playwright/test'
