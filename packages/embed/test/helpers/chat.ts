import type {Page} from 'playwright'
import {expect as expectLocator} from 'playwright/test'

const PANEL_TIMEOUT_MS = 30_000

export function chatBox(page: Page) {
  return page.getByRole('textbox', {name: 'Message the conciv agent'})
}

export async function openChatPanel(page: Page): Promise<void> {
  await expectLocator(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: PANEL_TIMEOUT_MS})
  await page.getByRole('button', {name: 'Open conciv chat'}).click()
  await expectLocator(chatBox(page)).toBeVisible({timeout: PANEL_TIMEOUT_MS})
}

export async function sendChatMessage(page: Page, text: string): Promise<void> {
  await chatBox(page).fill(text)
  await page.getByRole('button', {name: 'Send message'}).click()
}
