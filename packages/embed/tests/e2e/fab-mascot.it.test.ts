import {expect, test, type Page} from '@playwright/test'
import {openChatPanel, sendHeldTurn} from './helpers/chat.js'
import {setupWidgetSuite} from './helpers/suite.js'

const suite = setupWidgetSuite()

const IMMEDIATE_MS = 2_000

const stage = (page: Page) => page.locator('[data-conciv-fab] .conciv-fab-rig[aria-hidden="true"]')

const glowingEyes = (page: Page) =>
  page.locator('[data-conciv-fab] .conciv-fab-busy ~ .conciv-fab-rig .conciv-rig-eyes')

const restingEyes = (page: Page) => page.locator('[data-conciv-fab] .conciv-fab-rig .conciv-rig-eyes')

const AWAKE_EYES = /^matrix\(1, 0, 0, 1\.06,/

const TRACKING_EYES = /^matrix\(1, 0, 0, 1, (?!0,)/

const GAZE_TARGET = {x: 12, y: 12}

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

test('a closed launcher with nothing running rests and tracks the pointer', async ({page}) => {
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await expect(stage(page)).toBeVisible()

  await expect(restingEyes(page)).not.toHaveCSS('transform', AWAKE_EYES)
  await expect(emitter(page)).toHaveCount(0)
  await page.mouse.move(GAZE_TARGET.x, GAZE_TARGET.y)
  await expect(restingEyes(page)).toHaveCSS('transform', TRACKING_EYES)
})

test('opening the panel with nothing running wakes the robot and drops the gaze', async ({page}) => {
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await openChatPanel(page)

  await expect(restingEyes(page)).toHaveCSS('transform', AWAKE_EYES)
  await expect(emitter(page)).toHaveCount(0)
})

test('the emitter keeps running while the panel is open during a run', async ({page}) => {
  await sendHeldTurn(page, suite)

  await expect(emitter(page)).toHaveCount(1)
})
