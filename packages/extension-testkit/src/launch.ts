import {chromium, type Page} from 'playwright'

export type LaunchedPage = {page: Page; close: () => Promise<void>}

export async function launch(url: string): Promise<LaunchedPage> {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(url, {waitUntil: 'domcontentloaded'})
  return {page, close: () => browser.close()}
}
