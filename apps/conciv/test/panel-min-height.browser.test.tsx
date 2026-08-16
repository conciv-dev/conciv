import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import pageExtension from '@conciv/extension-page/client'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession, seedDraft} from './helpers/core-session.js'
import {persistedGrab, tallGrab} from './helpers/grab-fixtures.js'
import {createShellHarness} from './helpers/shell-harness.js'

const STAGED = [
  persistedGrab('grab-1', tallGrab('Hero', 900)),
  persistedGrab('grab-2', tallGrab('Pricing', 900)),
  persistedGrab('grab-3', tallGrab('Footer', 900)),
  persistedGrab('grab-4', tallGrab('Nav', 900)),
]

const FULLY_IN_VIEWPORT = {ratio: 0.99}

const core = {base: ''}
const harness = createShellHarness(() => core.base)

beforeAll(async () => {
  const booted = await coreControl.bootCore({id: 'panel-min-height', allowedOrigins: [window.location.origin]})
  core.base = booted.base
}, 60_000)

afterAll(async () => {
  await coreControl.closeCore()
}, 30_000)

afterEach(harness.dispose)

async function openPanel(): Promise<void> {
  const rpc = coreRpc(core.base)
  const sessionId = await createSession(rpc)
  await seedDraft(rpc, sessionId, {attachments: STAGED})
  harness.mountShell(`/panel/${sessionId}?open=true`, [pageExtension])
}

const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

test('the composer stays reachable when the viewport clamps the panel below its minimum height', async () => {
  await page.viewport(1000, 400)
  await openPanel()

  await expect.element(page.getByText('Hero at src/routes/Hero.tsx:1')).toBeVisible()
  await expect.element(input()).toBeInViewport(FULLY_IN_VIEWPORT)

  await input().click()
  await input().fill('still typeable at the smallest panel')
  await page.getByRole('button', {name: 'Send message'}).click()

  await expect.element(page.getByText('still typeable at the smallest panel')).toBeVisible()
}, 30_000)

test('staged grab cards never push the composer out of the viewport as they pile up', async () => {
  await page.viewport(1000, 900)
  await openPanel()

  await expect.element(page.getByText('Hero at src/routes/Hero.tsx:1')).toBeVisible()
  await expect.element(page.getByText('Nav at src/routes/Nav.tsx:1')).toBeVisible()

  await expect.element(input()).toBeInViewport(FULLY_IN_VIEWPORT)
  await expect.element(page.getByRole('button', {name: 'Send message'})).toBeInViewport(FULLY_IN_VIEWPORT)
}, 30_000)
