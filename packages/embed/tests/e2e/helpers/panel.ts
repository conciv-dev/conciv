import {expect, type Page} from '@playwright/test'

export async function openPanel(page: Page): Promise<void> {
  const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
  const opener = page.getByRole('button', {name: 'Open conciv chat'})
  await expect(composer.or(opener)).toBeVisible({timeout: 30_000})
  if (!(await composer.isVisible())) await opener.click()
  await expect(composer).toBeVisible({timeout: 30_000})
}

export async function sendMessage(page: Page, text: string, reply: string): Promise<void> {
  await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill(text)
  await page.getByRole('button', {name: 'Send message'}).click()
  await expect(page.getByText(reply).first()).toBeVisible({timeout: 30_000})
}
