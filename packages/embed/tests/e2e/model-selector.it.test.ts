import {expect, test} from '@playwright/test'
import {failRpcCalls} from '@conciv/extension-testkit/rpc-fault'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'

const HARNESS_MODELS = [
  {id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5'},
  {id: 'claude-opus-4-1', name: 'Claude Opus 4.1'},
]

const suite = setupWidgetSuite({text: 'Hello from conciv', models: HARNESS_MODELS})

test.describe('model selector error path', () => {
  test.use({viewport: {width: 900, height: 760}})

  test('offers a retry when meta.models fails and recovers on retry', async ({page}) => {
    const models = await failRpcCalls(page, {path: ['meta', 'models']})
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    const retry = page.getByRole('button', {name: 'Retry loading models'})
    await expect(retry).toBeVisible({timeout: 30_000})
    await expect(page.getByText('Couldn’t load models').first()).toBeVisible({timeout: 30_000})

    models.repair()
    await retry.click()
    await expect(page.getByRole('button', {name: 'Select model'})).toBeVisible({timeout: 30_000})
  })
})
