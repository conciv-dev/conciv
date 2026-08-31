import {expect, test} from '@playwright/test'
import recorderServer from '@conciv/extension-recorder'
import {currentHref} from '@conciv/extension-testkit/navigation-state'
import {until} from '@conciv/harness-testkit/until'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'

const suite = setupWidgetSuite({text: 'Unknown view reply', extensions: [recorderServer]})

test.describe('restoring a persisted panel route whose extension view is no longer mounted', () => {
  test('lands on the chat view instead of an empty pane', async ({page}) => {
    test.setTimeout(240_000)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    await page.getByRole('tab', {name: 'Recorder'}).click()
    await expect(page.getByRole('tab', {name: 'Recorder'})).toHaveAttribute('aria-selected', 'true')
    await until(async () => (await currentHref(suite.kit())).includes('/recorder'), {
      hangGuardMs: 30_000,
      intervalMs: 100,
    })

    await page.goto(`${suite.host().base}/?extensions=terminal`, {waitUntil: 'domcontentloaded'})

    await expect(page.getByRole('dialog', {name: 'conciv chat agent'})).toBeVisible({timeout: 30_000})
    await expect(page.getByRole('tab', {name: 'Recorder'})).toHaveCount(0)
    await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toBeVisible({timeout: 30_000})
    const statusBar = page.getByRole('toolbar', {name: 'Session status'})
    await expect(statusBar.getByRole('tab', {name: 'Chat', exact: true})).toHaveAttribute('aria-selected', 'true')
    await until(async () => !(await currentHref(suite.kit())).includes('/recorder'), {
      hangGuardMs: 30_000,
      intervalMs: 100,
    })
  })
})
