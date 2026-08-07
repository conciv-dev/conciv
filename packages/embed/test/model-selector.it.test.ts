import {describe, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel} from './helpers/panel.js'

const HARNESS_MODELS = [
  {id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5'},
  {id: 'claude-opus-4-1', name: 'Claude Opus 4.1'},
]

const suite = setupWidgetSuite({text: 'Hello from conciv', models: HARNESS_MODELS})

describe('model selector error path', () => {
  it('offers a retry when meta.models fails and recovers on retry', async () => {
    const page = await suite.browser().newPage({viewport: {width: 900, height: 760}})
    const broken = {value: true}
    await page.route('**/rpc/meta/models*', async (route) => {
      if (!broken.value) return route.continue()
      await route.fulfill({status: 500, contentType: 'application/json', body: JSON.stringify({json: {}, meta: []})})
    })
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await openPanel(page)

    const retry = page.getByRole('button', {name: 'Retry loading models'})
    await expectLocator(retry).toBeVisible({timeout: 30_000})
    await expectLocator(page.getByText('Couldn’t load models').first()).toBeVisible({timeout: 30_000})

    broken.value = false
    await retry.click()
    await expectLocator(page.getByRole('button', {name: 'Select model'})).toBeVisible({timeout: 30_000})
    await page.close()
  })
})
