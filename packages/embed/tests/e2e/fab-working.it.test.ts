import {expect, test, type Page} from '@playwright/test'
import {setupWidgetSuite} from './helpers/suite.js'
import {sendHeldTurn} from './helpers/chat.js'

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

test.afterEach(() => {
  suite.kit().harness.script.release()
})

test('the sending tab marks the open panel launcher busy while its run is still streaming', async ({page}) => {
  await sendHeldTurn(page, suite)

  await expect(panelLauncher(page)).toHaveAttribute('aria-busy', 'true', {timeout: IMMEDIATE_MS})
})

test('minimizing the panel mid-run leaves the closed launcher wearing the busy state', async ({page}) => {
  await sendHeldTurn(page, suite)

  await panelLauncher(page).click()

  await expect(openLauncher(page)).toHaveAttribute('aria-busy', 'true', {timeout: IMMEDIATE_MS})
})

test('switching to a new session mid-run hands the busy state over to the session list', async ({page}) => {
  await sendHeldTurn(page, suite)

  await page.getByRole('button', {name: 'More composer actions'}).click()
  await page.getByRole('menuitem', {name: 'Start a new session'}).click()

  await expect(stopButton(page)).toHaveCount(0, {timeout: IMMEDIATE_MS})
  await expect(panelLauncher(page)).toHaveAttribute('aria-busy', 'false')

  await page.getByRole('button', {name: 'Session options'}).click()
  await page.getByRole('button', {name: /^Session: /}).click()
  await expect(page.getByRole('option', {name: /running/})).toBeVisible({timeout: 30_000})
})
