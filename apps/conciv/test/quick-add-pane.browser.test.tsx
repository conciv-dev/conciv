import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {createShellHarness} from './helpers/shell-harness.js'

const PANEL_SESSION = 'conciv_1'
const harness = createShellHarness(PANEL_SESSION)
const mountShell = (config: Parameters<typeof harness.mountShell>[1] = {}): void => harness.mountShell('/quick', config)

afterEach(harness.dispose)

const startFailure = () => page.getByText(/conciv could not start a pane/)
const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

test('a quick terminal pane that fails to start shows a retry action', async () => {
  mountShell({resolveRejects: true})

  await expect.element(startFailure(), {timeout: 8000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Retry'})).toBeVisible()
})

test('retrying a failed quick terminal pane against a healthy engine starts it', async () => {
  mountShell({resolveRejects: true})
  await expect.element(startFailure(), {timeout: 8000}).toBeVisible()

  harness.core()?.setResolveRejects(false)
  await page.getByRole('button', {name: 'Retry'}).click()

  await expect.element(editor(), {timeout: 8000}).toBeVisible()
  await expect.element(startFailure()).not.toBeInTheDocument()
})
