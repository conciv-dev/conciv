import type {Page} from 'playwright'
import {expect} from 'playwright/test'

export async function completeConnectHandshake(page: Page, apiBase: string): Promise<void> {
  await expect(page.getByRole('status', {name: 'connect pane ready'})).toBeVisible({timeout: 30_000})
  const subscribed = page.waitForResponse((response) => response.url().endsWith('/rpc/page/queries'), {timeout: 30_000})
  await page.evaluate((base) => window.dispatchEvent(new CustomEvent('embedtest:connect', {detail: {base}})), apiBase)
  await subscribed
}
