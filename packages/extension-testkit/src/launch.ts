import {chromium, type BrowserContext, type Page} from 'playwright'

export type LaunchedPage = {page: Page; context: BrowserContext; close: () => Promise<void>}

export async function launch(url: string): Promise<LaunchedPage> {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(url, {waitUntil: 'domcontentloaded'})
  return {page, context, close: () => browser.close()}
}
