import {expect, test, type Page} from '@playwright/test'
import {openChatPanel, sendChatMessage} from './helpers/chat.js'
import {setupWidgetSuite} from './helpers/suite.js'

const suite = setupWidgetSuite()

const IMMEDIATE_MS = 2_000

const stage = (page: Page) => page.locator('[data-pw-fab] .pw-fab-rig[aria-hidden="true"]')

const glowingEyes = (page: Page) => page.locator('[data-pw-fab] .pw-fab-busy ~ .pw-fab-rig .pw-rig-eyes')

const restingEyes = (page: Page) => page.locator('[data-pw-fab] .pw-fab-rig .pw-rig-eyes')

test.afterEach(() => {
  suite.kit().harness.script.release()
})

test('the launcher hosts the mascot stage as decorative content', async ({page}) => {
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})

  await expect(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible()
  await expect(stage(page)).toBeVisible()
  await expect(restingEyes(page)).toBeAttached()
})

test('an idle launcher never matches the busy eye-glow selector', async ({page}) => {
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})

  await expect(stage(page)).toBeVisible()
  await expect(glowingEyes(page)).toHaveCount(0)
})

test('a streaming run puts the busy overlay ahead of the stage so the eye-glow selector matches', async ({page}) => {
  suite.kit().harness.script.hold()
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await openChatPanel(page)
  await sendChatMessage(page, 'hold this turn open')
  await expect(page.getByRole('button', {name: 'Stop generating'})).toBeVisible()

  await expect(glowingEyes(page)).toBeAttached({timeout: IMMEDIATE_MS})
})
