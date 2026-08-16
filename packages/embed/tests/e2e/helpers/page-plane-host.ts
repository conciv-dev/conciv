import type {Page} from '@playwright/test'
import {awaitPagePlaneSubscribed} from '@conciv/extension-testkit/page-plane'

const PAGE_DRIVER_TIMEOUT_MS = 30_000

export async function openPagePlaneHost(page: Page, base: string): Promise<Page> {
  await awaitPagePlaneSubscribed(page, async () => {
    await page.goto(base, {waitUntil: 'domcontentloaded'})
    await page.waitForFunction(() => '__CONCIV_PAGE_DRIVER__' in window, undefined, {timeout: PAGE_DRIVER_TIMEOUT_MS})
  })
  return page
}
