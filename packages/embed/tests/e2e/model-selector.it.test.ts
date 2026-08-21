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
    test.setTimeout(180_000)
    const models = await failRpcCalls(page, {path: ['meta', 'models'], websocket: true})
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    const moreActions = page.getByRole('button', {name: 'More composer actions'})
    await moreActions.click()
    const retry = page.getByRole('menuitem', {name: /Retry loading models/})
    await expect(retry).toBeVisible({timeout: 30_000})
    await expect(page.getByText('Couldn’t load models').first()).toBeVisible({timeout: 30_000})

    models.repair()
    await retry.click()
    await moreActions.click()
    await expect(page.getByRole('menuitem', {name: /^Model: Claude Sonnet 4\.5/})).toBeVisible({timeout: 30_000})
    await page.keyboard.press('Escape')
  })
})
