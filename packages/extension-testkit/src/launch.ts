import {chromium, type BrowserContext, type Page} from 'playwright'
import {pagePlaneWatchFor} from './page-plane.js'
import {rpcObserverFor} from './rpc-observer.js'

export type LaunchedPage = {page: Page; context: BrowserContext; close: () => Promise<void>}

export async function openObservedPage(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage()
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
