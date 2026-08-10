import type {Browser, Page} from 'playwright'
import {observeRpc} from '@conciv/extension-testkit/rpc-observer'

export async function openPagePlaneHost(browser: Browser, base: string): Promise<Page> {
  const page = await browser.newPage()
  const observer = observeRpc(page)
  try {
    const subscribed = observer.completed({path: ['page', 'queries'], timeout: 30_000})
    await page.goto(base, {waitUntil: 'domcontentloaded'})
    await page.waitForFunction(() => '__CONCIV_PAGE_DRIVER__' in window, undefined, {timeout: 30_000})
    await subscribed
    return page
  } catch (error) {
    await page.close().catch(() => undefined)
    throw error
  } finally {
    observer.dispose()
  }
}
