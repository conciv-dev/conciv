import {expect, test, type Page} from '@playwright/test'
import {sendHeldTurn} from './helpers/chat.js'
import {setupWidgetSuite} from './helpers/suite.js'

const suite = setupWidgetSuite()

const IMMEDIATE_MS = 2_000

const stage = (page: Page) => page.locator('[data-conciv-fab] .conciv-fab-rig[aria-hidden="true"]')

const glowingEyes = (page: Page) =>
  page.locator('[data-conciv-fab] .conciv-fab-busy ~ .conciv-fab-rig .conciv-rig-eyes')

const restingEyes = (page: Page) => page.locator('[data-conciv-fab] .conciv-fab-rig .conciv-rig-eyes')

const emitter = (page: Page) =>
  page.locator('[data-conciv-fab] .conciv-fab-rig [data-scope="mascot"][data-part="effect"] > span')

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
  await sendHeldTurn(page, suite)

  await expect(glowingEyes(page)).toBeAttached({timeout: IMMEDIATE_MS})
})

test('the emitter keeps running while the panel is open during a run', async ({page}) => {
  await sendHeldTurn(page, suite)

  await expect(emitter(page)).toHaveCount(1)
})
