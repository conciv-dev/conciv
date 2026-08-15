import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession, seedDraft} from './helpers/core-session.js'
import {createShellHarness} from './helpers/shell-harness.js'

const STAGED = ['the grabbed hero section', 'the grabbed price row', 'the grabbed footer', 'the grabbed nav']

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
  await seedDraft(rpc, sessionId, {grabs: STAGED})
  harness.mountShell(`/panel/${sessionId}?open=true`)
}

const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

test('the composer stays reachable when the viewport clamps the panel below its minimum height', async () => {
  await page.viewport(1000, 400)
  await openPanel()

  await expect.element(page.getByText('the grabbed hero section')).toBeVisible()

  await input().click()
  await input().fill('still typeable at the smallest panel')
  await page.getByRole('button', {name: 'Send message'}).click()

  await expect.element(page.getByText('still typeable at the smallest panel')).toBeVisible()
}, 30_000)

test('the grabs strip resizes through the shared separator handle', async () => {
  await page.viewport(1000, 900)
  await openPanel()

  const handle = page.getByRole('separator', {name: 'Resize grabs height'})
  await expect.element(handle).toBeVisible()
  await expect.element(handle).toHaveAttribute('aria-valuenow', '288')
  await expect.element(page.getByText('the grabbed hero section')).toBeVisible()
  await expect.element(page.getByText('the grabbed nav')).toBeVisible()
}, 30_000)

test('the staged grabs come back into the flow once the panel has room again', async () => {
  await page.viewport(1000, 400)
  await openPanel()

  await expect.element(input()).toBeVisible()

  await page.viewport(1000, 900)

  await expect.element(page.getByText('the grabbed hero section')).toBeVisible()
  await expect.element(page.getByText('the grabbed nav')).toBeVisible()
  await page.getByRole('button', {name: 'Remove grabbed element'}).last().click()
  await expect.element(page.getByText('the grabbed nav')).not.toBeInTheDocument()
  await input().click()
  await input().fill('room to breathe')
  await page.getByRole('button', {name: 'Send message'}).click()
  await expect.element(page.getByText('room to breathe')).toBeVisible()
}, 30_000)
