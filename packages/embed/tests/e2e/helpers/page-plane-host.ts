import type {Page} from '@playwright/test'
import {observeRpc} from '@conciv/extension-testkit/rpc-observer'

export async function openPagePlaneHost(page: Page, base: string): Promise<Page> {
  const observer = observeRpc(page)
  try {
    const subscribed = observer.completed({path: ['page', 'queries'], timeout: 30_000})
    await page.goto(base, {waitUntil: 'domcontentloaded'})
    await page.waitForFunction(() => '__CONCIV_PAGE_DRIVER__' in window, undefined, {timeout: 30_000})
    await subscribed
    return page
  } finally {
    observer.dispose()
  }
}
