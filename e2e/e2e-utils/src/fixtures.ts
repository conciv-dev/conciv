import {test as base, type Page} from '@playwright/test'

export const test = base.extend<{secondPage: Page}>({
  secondPage: async ({browser}, use) => {
    const page = await browser.newPage()
    await use(page)
    await page.close()
  },
})

export {expect} from '@playwright/test'
