import {expect} from 'vitest'
import type {Page} from 'playwright'

export async function openPanel(page: Page): Promise<void> {
  await page.getByRole('button', {name: 'Open conciv chat'}).click()
  await expect
    .poll(() => page.getByRole('textbox', {name: 'Message the conciv agent'}).isVisible(), {timeout: 15_000})
    .toBe(true)
}
