import {afterAll, beforeAll} from 'vitest'
import {test as browserTest} from '@conciv/browser-fixture'
import {startWranglerDev, type WranglerDev} from './wrangler-dev.js'

const BOOT_TIMEOUT = 120_000

export function serveSite(options: {port: number; inspectorPort: number}): string {
  let site: WranglerDev | undefined

  beforeAll(async () => {
    site = await startWranglerDev(options)
  }, BOOT_TIMEOUT)

  afterAll(async () => {
    await site?.stop()
  })

  return `http://127.0.0.1:${options.port}`
}

export function createSiteTest(options: {port: number; inspectorPort: number}) {
  return browserTest.extend<{$file: {site: WranglerDev}}>({
    site: [
      // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
      async ({}, use) => {
        const site = await startWranglerDev(options)
        await use(site)
        await site.stop()
      },
      {scope: 'file', auto: true},
    ],
  })
}
