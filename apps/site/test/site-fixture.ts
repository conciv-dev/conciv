import {test as browserTest} from '@conciv/browser-fixture'
import {startWranglerDev, type WranglerDev, type WranglerDevOptions} from './wrangler-dev.js'

export function createSiteTest(options: WranglerDevOptions) {
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
