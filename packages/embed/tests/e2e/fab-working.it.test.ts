import {expect, test, type Page} from '@playwright/test'
import {setupWidgetSuite} from './helpers/suite.js'
import {openChatPanel, sendChatMessage} from './helpers/chat.js'

const suite = setupWidgetSuite()

const PANEL_TIMEOUT_MS = 30_000

function launcher(page: Page) {
  return page.getByRole('button', {name: 'Minimize conciv chat'})
}

test.afterEach(() => {
  suite.kit().harness.script.release()
})

test('the sending tab marks the launcher busy while its run is still streaming', async ({page}) => {
  suite.kit().harness.script.hold()
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await openChatPanel(page)
  await sendChatMessage(page, 'hold this turn open')

  await expect(page.getByRole('button', {name: 'Stop generating'})).toBeVisible({timeout: PANEL_TIMEOUT_MS})
  await expect(launcher(page)).toHaveAttribute('aria-busy', 'true')
})
