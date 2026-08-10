import {test as base} from 'vitest'
import {chromium, type Browser} from 'playwright'
import pTimeout from 'p-timeout'

const BROWSER_CLOSE_TIMEOUT_MS = 30_000

export const test = base.extend<{$file: {browser: Browser}}>({
  browser: [
    // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
    async ({}, use) => {
      const browser = await chromium.launch()
      await use(browser)
      await pTimeout(browser.close(), {
        milliseconds: BROWSER_CLOSE_TIMEOUT_MS,
        message: `browser.close did not settle within ${BROWSER_CLOSE_TIMEOUT_MS}ms; a wedged CDP connection would otherwise hang fixture cleanup forever (vitest test.extend cleanup is unbounded)`,
      })
    },
    {scope: 'file'},
  ],
})
