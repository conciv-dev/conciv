import {expect, type Page} from '@playwright/test'
import type {WidgetSuite} from './suite.js'

const PANEL_TIMEOUT_MS = 30_000

export function chatBox(page: Page) {
  return page.getByRole('textbox', {name: 'Message the conciv agent'})
}

export async function openChatPanel(page: Page): Promise<void> {
  await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible({timeout: PANEL_TIMEOUT_MS})
  await page.getByRole('button', {name: 'Open conciv chat'}).click()
  await expect(chatBox(page)).toBeVisible({timeout: PANEL_TIMEOUT_MS})
}

export async function sendChatMessage(page: Page, text: string): Promise<void> {
  await chatBox(page).fill(text)
  await page.getByRole('button', {name: 'Send message'}).click()
}

export async function sendHeldTurn(page: Page, suite: WidgetSuite): Promise<void> {
  suite.kit().harness.script.hold()
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await openChatPanel(page)
  await sendChatMessage(page, 'hold this turn open')
  await expect(page.getByRole('button', {name: 'Stop generating'})).toBeVisible()
}
