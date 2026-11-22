import {readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {test as base, type Page} from '@playwright/test'
import {e2eConfigDir} from './config.js'
import {e2ePluginCopyDir} from './dev-endpoint.js'

type RebuildPlugin = (plugin: string, from: string, to: string) => Promise<void>

export const test = base.extend<{secondPage: Page; rebuildPlugin: RebuildPlugin}>({
  secondPage: async ({browser}, use) => {
    const page = await browser.newPage()
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
