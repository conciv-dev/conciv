import {expect, test, type Page} from '@playwright/test'
import {setupWidgetSuite} from './helpers/suite.js'
import {openChatPanel, sendChatMessage} from './helpers/chat.js'

const suite = setupWidgetSuite()

const IMMEDIATE_MS = 2_000

function openLauncher(page: Page) {
  return page.getByRole('button', {name: 'Open conciv chat'})
}

function panelLauncher(page: Page) {
  return page.getByRole('button', {name: 'Minimize conciv chat'})
}

function stopButton(page: Page) {
  return page.getByRole('button', {name: 'Stop generating'})
}

async function sendAndHold(page: Page): Promise<void> {
  suite.kit().harness.script.hold()
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await openChatPanel(page)
  await sendChatMessage(page, 'hold this turn open')
  await expect(stopButton(page)).toBeVisible()
}

test.afterEach(() => {
  suite.kit().harness.script.release()
})

test('the sending tab marks the open panel launcher busy while its run is still streaming', async ({page}) => {
  await sendAndHold(page)

  await expect(panelLauncher(page)).toHaveAttribute('aria-busy', 'true', {timeout: IMMEDIATE_MS})
})

test('minimizing the panel mid-run leaves the closed launcher wearing the busy state', async ({page}) => {
  await sendAndHold(page)

  await panelLauncher(page).click()

  await expect(openLauncher(page)).toHaveAttribute('aria-busy', 'true', {timeout: IMMEDIATE_MS})
})

test('switching to a new session mid-run hands the busy state over to the session list', async ({page}) => {
  await sendAndHold(page)

  await page.getByRole('button', {name: 'Start a new session'}).click()

  await expect(stopButton(page)).toHaveCount(0)
  await expect(panelLauncher(page)).toHaveAttribute('aria-busy', 'true')
})
