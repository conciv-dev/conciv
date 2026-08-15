import type {Page} from '@playwright/test'

export async function mountHandle(page: Page, apiBase: string): Promise<void> {
  await page.evaluate((base) => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    window.concivTestElement = el
    window.concivTestHandle = window.ConcivHandle.makeHandle(base)
    void window.concivTestHandle.mount(el)
  }, apiBase)
}

export async function openHostWithHandle(page: Page, hostBase: string, apiBase: string): Promise<string[]> {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await page.goto(hostBase, {waitUntil: 'domcontentloaded'})
  await mountHandle(page, apiBase)
  return pageErrors
}

export async function remountHandle(page: Page): Promise<void> {
  await page.evaluate(() => void window.concivTestHandle.mount(window.concivTestElement))
}

export async function unmountHandle(page: Page): Promise<void> {
  await page.evaluate(() => window.concivTestHandle.unmount())
}

export async function rebindHandle(page: Page, apiBase: string): Promise<void> {
  await page.evaluate((base) => window.concivTestHandle.rebind(base), apiBase)
}
