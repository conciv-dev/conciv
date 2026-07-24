import {expect} from 'vitest'
import type {Page} from 'playwright'

export async function openPanel(page: Page): Promise<void> {
  await page.getByRole('button', {name: 'Open conciv chat'}).click()
  await expect
    .poll(() => page.getByRole('textbox', {name: 'Message the conciv agent'}).isVisible(), {timeout: 30_000})
    .toBe(true)
}

export async function sendMessage(page: Page, text: string, reply: string): Promise<void> {
  await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(text)
  await page.getByRole('button', {name: 'Send message'}).click()
  await expect.poll(() => page.getByText(reply).first().isVisible(), {timeout: 30_000}).toBe(true)
}
