import {chromium, type BrowserContext, type Page} from 'playwright'
import {pagePlaneWatchFor} from '@conciv/plugin-testkit/page-plane'
import {rpcObserverFor} from '@conciv/plugin-testkit/rpc-observer'
import {rpcSocketFor} from '@conciv/plugin-testkit/rpc-socket'

export type LaunchedPage = {page: Page; context: BrowserContext; close: () => Promise<void>}

export async function openObservedPage(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage()
  await rpcSocketFor(page).installed
  const observer = rpcObserverFor(page)
  const plane = pagePlaneWatchFor(page)
  page.once('close', () => {
    observer.dispose()
    plane.dispose()
  })
  await page.goto(url, {waitUntil: 'domcontentloaded'})
  return page
}

export async function launch(url: string): Promise<LaunchedPage> {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await openObservedPage(context, url)
  return {page, context, close: () => browser.close()}
}
